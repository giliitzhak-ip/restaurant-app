import * as THREE from 'three';
import { NET, TABLE } from '../../shared/constants';
import {
  barrierTexture,
  courtMatTexture,
  netTexture,
  tableTopTexture,
  wallTexture,
  woodFloorTexture,
} from './textures';

export interface HallObjects {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  spots: THREE.SpotLight[];
  tableTop: THREE.Mesh;
}

const HALL = { w: 22, d: 30, h: 9 };

/** Build the arena: floor, court mat, barriers, walls, ceiling lights, table and net. */
export function buildHall(highDetail: boolean): HallObjects {
  const root = new THREE.Group();

  // ── Floor and court ──
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({ map: woodFloorTexture(), roughness: 0.55, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 12),
    new THREE.MeshStandardMaterial({ map: courtMatTexture(), roughness: 0.9 }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.003;
  court.receiveShadow = true;
  root.add(court);

  // ── Barriers around the court ──
  const barrierTexA = barrierTexture('PING PONG 3D', '#29a3ff');
  const barrierTexB = barrierTexture('TABLE TENNIS', '#ff8a29');
  const barrierGeo = new THREE.BoxGeometry(1.95, 0.72, 0.04);
  const addBarrier = (x: number, z: number, rotY: number, alt: boolean) => {
    const m = new THREE.Mesh(
      barrierGeo,
      new THREE.MeshStandardMaterial({ map: alt ? barrierTexB : barrierTexA, roughness: 0.6 }),
    );
    m.position.set(x, 0.36, z);
    m.rotation.y = rotY;
    m.castShadow = highDetail;
    m.receiveShadow = true;
    root.add(m);
  };
  for (let i = 0; i < 3; i++) {
    const x = -2 + i * 2;
    addBarrier(x, -6, 0, i % 2 === 1);
    addBarrier(x, 6, Math.PI, i % 2 === 1);
  }
  for (let i = 0; i < 6; i++) {
    const z = -5 + i * 2;
    addBarrier(-3.5, z, Math.PI / 2, i % 2 === 0);
    addBarrier(3.5, z, -Math.PI / 2, i % 2 === 0);
  }

  // ── Walls and ceiling ──
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.85 });
  const wallGeo = new THREE.PlaneGeometry(HALL.d, HALL.h);
  const sideWallGeo = new THREE.PlaneGeometry(HALL.w, HALL.h);
  const walls: [THREE.PlaneGeometry, number, number, number][] = [
    [sideWallGeo, 0, -HALL.d / 2, 0],
    [sideWallGeo, 0, HALL.d / 2, Math.PI],
    [wallGeo, -HALL.w / 2, 0, Math.PI / 2],
    [wallGeo, HALL.w / 2, 0, -Math.PI / 2],
  ];
  for (const [geo, x, z, ry] of walls) {
    const w = new THREE.Mesh(geo, wallMat);
    w.position.set(x, HALL.h / 2, z);
    w.rotation.y = ry;
    root.add(w);
  }
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.w, HALL.d),
    new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HALL.h;
  root.add(ceiling);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 });
  const panelGeo = new THREE.BoxGeometry(1.6, 0.05, 0.5);
  for (const x of [-3, 0, 3]) {
    for (const z of [-6, -2, 2, 6]) {
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.position.set(x, HALL.h - 0.05, z);
      root.add(p);
    }
  }

  // Stands: simple tiered blocks along the long walls for atmosphere.
  const standMat = new THREE.MeshStandardMaterial({ color: 0x232c40, roughness: 0.8 });
  const seatColors = [0x2d6cdf, 0xe0452b, 0x2d6cdf, 0xf2b630];
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 4; tier++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 20), standMat);
      step.position.set(side * (7.5 + tier * 1), 0.22 + tier * 0.45, 0);
      step.receiveShadow = true;
      root.add(step);
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.12, 19.6),
        new THREE.MeshStandardMaterial({ color: seatColors[tier], roughness: 0.7 }),
      );
      seats.position.set(side * (7.5 + tier * 1), 0.5 + tier * 0.45, 0);
      root.add(seats);
    }
  }

  // ── Table ──
  const table = new THREE.Group();
  const topTex = tableTopTexture(highDetail ? 2048 : 1024);
  const topMat = highDetail
    ? new THREE.MeshPhysicalMaterial({ map: topTex, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 })
    : new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.45 });
  const topGeo = new THREE.PlaneGeometry(TABLE.length, TABLE.width);
  topGeo.rotateX(-Math.PI / 2);
  topGeo.rotateY(Math.PI / 2);
  const tableTop = new THREE.Mesh(topGeo, topMat);
  tableTop.position.y = TABLE.height + 0.0005;
  tableTop.receiveShadow = true;
  table.add(tableTop);
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length),
    new THREE.MeshStandardMaterial({ color: 0x0f2f55, roughness: 0.6 }),
  );
  slab.position.y = TABLE.height - TABLE.thickness / 2;
  slab.castShadow = true;
  table.add(slab);
  // Undercarriage: frame and legs.
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.75 });
  const legGeo = new THREE.BoxGeometry(0.05, TABLE.height - TABLE.thickness, 0.05);
  for (const x of [-0.62, 0.62]) {
    for (const z of [-1.1, -0.2, 0.2, 1.1]) {
      const leg = new THREE.Mesh(legGeo, metal);
      leg.position.set(x, (TABLE.height - TABLE.thickness) / 2, z);
      leg.castShadow = true;
      table.add(leg);
    }
  }
  for (const z of [-0.65, 0.65]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.05), metal);
    beam.position.set(0, 0.25, z);
    table.add(beam);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.62, 0.62]) {
    for (const z of [-1.1, 1.1]) {
      const wh = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
      wh.position.set(x, 0.04, z);
      table.add(wh);
    }
  }
  root.add(table);

  // ── Net ──
  const netMat = new THREE.MeshStandardMaterial({
    map: netTexture(),
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(NET.halfWidth * 2, NET.height - 0.015), netMat);
  net.position.set(0, TABLE.height + (NET.height - 0.015) / 2, 0);
  net.castShadow = highDetail;
  root.add(net);
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(NET.halfWidth * 2, 0.015, 0.006),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }),
  );
  tape.position.set(0, NET.top - 0.0075, 0);
  root.add(tape);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.35, metalness: 0.6 });
  for (const x of [-NET.halfWidth, NET.halfWidth]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, NET.height + 0.02, 12), postMat);
    post.position.set(x, TABLE.height + NET.height / 2, 0);
    root.add(post);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.06), postMat);
    clamp.position.set(x - Math.sign(x) * 0.13, TABLE.height - 0.01, 0);
    root.add(clamp);
  }

  // ── Lights ──
  const hemi = new THREE.HemisphereLight(0xdde7ff, 0x3b2a22, 0.75);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.1);
  sun.position.set(1.2, 7, 1.8);
  sun.target.position.set(0, TABLE.height, 0);
  sun.shadow.camera.left = -2.6;
  sun.shadow.camera.right = 2.6;
  sun.shadow.camera.top = 3.2;
  sun.shadow.camera.bottom = -3.2;
  sun.shadow.camera.near = 3;
  sun.shadow.camera.far = 10;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 4;
  root.add(sun, sun.target);

  const spots: THREE.SpotLight[] = [];
  for (const z of [-2.6, 2.6]) {
    const s = new THREE.SpotLight(0xfff0dd, 30, 14, 0.6, 0.6, 1.6);
    s.position.set(0, HALL.h - 0.4, z);
    s.target.position.set(0, 0, z * 0.6);
    root.add(s, s.target);
    spots.push(s);
  }
  return { root, sun, spots, tableTop };
}
