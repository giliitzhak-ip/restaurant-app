"""Match a reference face crop against candidate face images (SFace cosine similarity).

Used to translate the person the user picked (from our own detector) into the
face id of a provider's own face detection (e.g. Magic Hour face_mappings).
Prints {"best": index|null, "scores": [...]} as JSON.
"""
import argparse
import json

import cv2
import numpy as np


def embed(path, detector, recognizer):
    img = cv2.imread(path)
    if img is None:
        return None
    h, w = img.shape[:2]
    # Crops are small: upscale so the detector sees the face.
    if max(h, w) < 320:
        s = 320 / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)))
        h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0:
        return None
    face = max(faces, key=lambda f: f[2] * f[3])
    feat = recognizer.feature(recognizer.alignCrop(img, face)).flatten()
    return feat / (np.linalg.norm(feat) + 1e-9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True)
    ap.add_argument("--candidates", nargs="+", required=True)
    ap.add_argument("--yunet", required=True)
    ap.add_argument("--sface", required=True)
    ap.add_argument("--threshold", type=float, default=0.363)
    a = ap.parse_args()
    det = cv2.FaceDetectorYN.create(a.yunet, "", (320, 320), 0.6, 0.3, 50)
    rec = cv2.FaceRecognizerSF.create(a.sface, "")
    ref = embed(a.reference, det, rec)
    scores = []
    for c in a.candidates:
        e = embed(c, det, rec)
        scores.append(None if (e is None or ref is None) else round(float(np.dot(ref, e)), 4))
    valid = [(s, i) for i, s in enumerate(scores) if s is not None and s >= a.threshold]
    best = max(valid)[1] if valid else None
    print(json.dumps({"best": best, "scores": scores}))


if __name__ == "__main__":
    main()
