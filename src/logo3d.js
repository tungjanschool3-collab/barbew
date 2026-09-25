import * as THREE from "three";

// Small spinning 3D logo made of colorful bar-model blocks, rendered with three.js.
export function mountLogo3D(container) {
  const width = container.clientWidth || 64;
  const height = container.clientHeight || 64;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const group = new THREE.Group();
  scene.add(group);

  const colors = [0xff6b9d, 0xffa94d, 0xffd93d, 0x6bcb77, 0x4d96ff];
  const widths = [1.6, 1.1, 0.8];
  let x = -1.7;
  widths.forEach((w, i) => {
    const geo = new THREE.BoxGeometry(w, 0.5, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length] });
    const cube = new THREE.Mesh(geo, mat);
    cube.position.set(x + w / 2, (i - 1) * 0.65, 0);
    group.add(cube);
    x += w + 0.15;
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  let raf;
  function animate() {
    group.rotation.y += 0.015;
    group.rotation.x = Math.sin(Date.now() * 0.0006) * 0.2;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  function handleResize() {
    const w = container.clientWidth || 64;
    const h = container.clientHeight || 64;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", handleResize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", handleResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}
