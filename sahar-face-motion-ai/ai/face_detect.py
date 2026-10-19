"""Find the distinct people in a video (or the face in a photo) for the face-swap picker.

Input:  a directory of JPEG frames named <seconds>.jpg (extracted by FFmpeg from the
        browser preview, so rotation is already applied), or a single image.
Output: JSON on stdout + a cropped thumbnail per person written to --out.

Detection: YuNet. Identity: SFace embeddings, greedy clustering by cosine similarity,
so the same dancer seen in many frames becomes one selectable person.
Boxes are normalised to 0..1 so they map onto any rendition of the video.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

COSINE_SAME_PERSON = 0.363  # SFace paper/opencv_zoo recommended threshold
MIN_FACE_FRACTION = 0.03    # ignore faces smaller than 3% of the frame's short side


def load_frames(args):
    if args.image:
        img = cv2.imread(args.image)
        if img is None:
            raise SystemExit(json.dumps({"error": "unreadable_image"}))
        return [(0.0, img)]
    frames = []
    for name in sorted(os.listdir(args.frames)):
        if name.endswith(".jpg"):
            img = cv2.imread(os.path.join(args.frames, name))
            if img is not None:
                frames.append((float(name[:-4]), img))
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames")
    ap.add_argument("--image")
    ap.add_argument("--out", required=True)
    ap.add_argument("--yunet", required=True)
    ap.add_argument("--sface")
    ap.add_argument("--max-persons", type=int, default=8)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    detector = cv2.FaceDetectorYN.create(args.yunet, "", (320, 320), 0.8, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(args.sface, "") if args.sface and os.path.exists(args.sface) else None

    frames = load_frames(args)
    detections = []  # (t, frame_idx, row, feature)
    for idx, (t, img) in enumerate(frames):
        h, w = img.shape[:2]
        detector.setInputSize((w, h))
        _, faces = detector.detect(img)
        if faces is None:
            continue
        for row in faces:
            x, y, fw, fh = row[:4]
            if min(fw, fh) < MIN_FACE_FRACTION * min(w, h):
                continue
            feat = None
            if recognizer is not None:
                aligned = recognizer.alignCrop(img, row)
                feat = recognizer.feature(aligned).flatten()
                feat = feat / (np.linalg.norm(feat) + 1e-9)
            detections.append((t, idx, row, feat))

    # Greedy identity clustering (falls back to one cluster per detection in the best frame without SFace).
    clusters = []  # {centroid, members}
    for det in sorted(detections, key=lambda d: -float(d[2][-1])):
        feat = det[3]
        best, best_sim = None, -1.0
        if feat is not None:
            for c in clusters:
                sim = float(np.dot(c["centroid"], feat))
                if sim > best_sim:
                    best, best_sim = c, sim
        if best is not None and best_sim >= COSINE_SAME_PERSON:
            best["members"].append(det)
            v = best["centroid"] * (len(best["members"]) - 1) + feat
            best["centroid"] = v / (np.linalg.norm(v) + 1e-9)
        elif feat is not None or not clusters or args.image:
            clusters.append({"centroid": feat, "members": [det]})

    if recognizer is None and not args.image and detections:
        # Without identities, offer the faces of the frame with the most faces.
        counts = {}
        for d in detections:
            counts[d[1]] = counts.get(d[1], 0) + 1
        best_frame = max(counts, key=lambda k: (counts[k], -k))
        clusters = [{"centroid": None, "members": [d]} for d in detections if d[1] == best_frame]

    persons = []
    total = max(1, len(frames))
    clusters.sort(key=lambda c: (-len(c["members"]), -max(float(m[2][2] * m[2][3]) for m in c["members"])))
    for i, c in enumerate(clusters[: args.max_persons]):
        t, idx, row, _ = max(c["members"], key=lambda m: float(m[2][2] * m[2][3]) * float(m[2][-1]))
        img = frames[idx][1]
        h, w = img.shape[:2]
        x, y, fw, fh = [float(v) for v in row[:4]]
        pad = 0.35
        x0, y0 = int(max(0, x - fw * pad)), int(max(0, y - fh * pad))
        x1, y1 = int(min(w, x + fw * (1 + pad))), int(min(h, y + fh * (1 + pad)))
        thumb = f"person_{i}.jpg"
        crop = img[y0:y1, x0:x1]
        if crop.size:
            scale = 256 / max(crop.shape[:2])
            if scale < 1:
                crop = cv2.resize(crop, (int(crop.shape[1] * scale), int(crop.shape[0] * scale)), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(args.out, thumb), crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
        persons.append({
            "index": i,
            "thumb": thumb,
            "bestTime": t,
            "box": {"x": x / w, "y": y / h, "w": fw / w, "h": fh / h},
            "score": round(float(row[-1]), 3),
            "framesSeen": len({m[1] for m in c["members"]}),
            "presence": round(len({m[1] for m in c["members"]}) / total, 3),
            "times": sorted({round(m[0], 2) for m in c["members"]}),
        })

    json.dump({
        "detector": "yunet" + ("+sface" if recognizer is not None else ""),
        "framesAnalyzed": len(frames),
        "persons": persons,
    }, sys.stdout)


if __name__ == "__main__":
    main()
