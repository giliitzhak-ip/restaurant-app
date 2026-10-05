# Third-party assets

| Asset | File | Source | Licence |
|---|---|---|---|
| three.js r186 | `public/vendor/three.module.js`, `three.core.js` | [mrdoob/three.js](https://github.com/mrdoob/three.js) via npm | MIT |
| GLTFLoader, HDRLoader, SkeletonUtils, BufferGeometryUtils | `public/vendor/*.js` | three.js `examples/jsm` (same package) | MIT |
| Rigged character "Vanguard" with Idle / Walk / Run clips | `public/assets/soldier.glb` | three.js `examples/models/gltf/Soldier.glb` | Distributed with three.js (MIT repo). The character originates from Adobe **Mixamo**; Mixamo's own terms govern reuse of the character and its animations — **verify before any commercial release.** |
| Environment map for image-based lighting | `public/assets/env_sunset_1k.hdr` | three.js `examples/textures/equirectangular/venice_sunset_1k.hdr`, originally from [Poly Haven](https://polyhaven.com/) | CC0 |

Everything else in the scene — all terrain, buildings, props, the weapon, and
every albedo / normal / roughness map — is generated procedurally in
`public/sniper3d.html` at load time. No third-party image or model is used for
those, and no asset is taken from any other game.

## Still wanting replacement

The procedural material maps are good stand-ins but are not photogrammetric.
Swapping in scanned CC0 PBR sets (ambientCG, Poly Haven) for concrete,
plaster, rusted metal and glass would be the single biggest step up in
material realism.
