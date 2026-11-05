import {NodeIO} from "@gltf-transform/core";
import {ALL_EXTENSIONS} from "@gltf-transform/extensions";
import {weld, simplify, prune, dedup, textureCompress, draco, resample} from "@gltf-transform/functions";
import {MeshoptSimplifier} from "meshoptimizer";
import draco3d from "draco3dgltf";
import sharp from "sharp";
const [src, dst] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"draco3d.decoder": await draco3d.createDecoderModule(), "draco3d.encoder": await draco3d.createEncoderModule()});
const doc = await io.read(src), root = doc.getRoot();
for (const a of root.listAnimations()) if (!["Walking", "Running"].includes(a.getName())) { a.listChannels().forEach(c => c.dispose()); a.listSamplers().forEach(s => s.dispose()); a.dispose(); }
for (const m of root.listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.85); m.setDoubleSided(false); }
await doc.transform(
  weld(), simplify({simplifier: MeshoptSimplifier, ratio: 0.28, error: 0.01, lockBorder: true}),
  resample(), prune(), dedup(),
  textureCompress({encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82}),
  draco({quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12}),
);
await io.write(dst, doc);
const v = root.listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + p.getAttribute("POSITION").getCount(), 0);
console.log(dst.split("/").pop(), "verts", v, "anims", root.listAnimations().map(a => a.getName()).join(","), "textures", root.listTextures().length);
