import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { drawArNails, deriveNails, NAIL_JOINTS } from "../app/nail-ar-geometry.ts";
import { imagePointToLocal, localPointToImage, validContour, polygonSignedArea, contourInPose, boundsForNail } from "../app/nail-contours.ts";

const editor = readFileSync(new URL("../app/nail-contour-editor.tsx", import.meta.url), "utf8");
const ar = readFileSync(new URL("../app/nail-ar-try-on.tsx", import.meta.url), "utf8");
const params = { width: 480, height: 640, imageWidth: 960, imageHeight: 1280, mirror: false };
const hand = Array.from({ length: 21 }, () => ({ x: 0.48, y: 0.65 }));
for (const joint of NAIL_JOINTS) {
  const x = 0.2 + joint.finger * 0.14;
  hand[joint.tip] = { x, y: 0.23 };
  hand[joint.dip] = { x, y: 0.29 };
  hand[joint.pip] = { x, y: 0.38 };
}
const pose = deriveNails(hand, params, "medium")[2];
const outline = [
  { x: -0.27, y: -0.47 }, { x: 0, y: -0.53 },
  { x: 0.27, y: -0.47 }, { x: 0.4, y: -0.12 },
  { x: 0.36, y: 0.31 }, { x: 0, y: 0.49 },
  { x: -0.36, y: 0.31 }, { x: -0.4, y: -0.12 },
];

test("confirmed contour is valid and persists accurately in moving nail-local coordinates", () => {
  assert.ok(validContour(outline));
  assert.ok(Math.abs(polygonSignedArea(outline)) > 0.1);
  const image = localPointToImage(outline[3], pose);
  const back = imagePointToLocal(image, pose);
  assert.ok(Math.abs(back.x - outline[3].x) < 1e-9);
  assert.ok(Math.abs(back.y - outline[3].y) < 1e-9);
  const moved = { ...pose, x: pose.x + 34, y: pose.y + 24, angle: pose.angle + .28 };
  const polygon = contourInPose(outline, moved);
  assert.equal(polygon.length, outline.length);
  assert.notDeepEqual(polygon[0], localPointToImage(outline[0], pose));
});

test("precision mode refuses unconfirmed, invalid and self-crossing nail masks", () => {
  assert.equal(validContour([{x:0,y:0}]), false);
  assert.equal(validContour(outline.map(p => ({x:p.x*0.05,y:p.y*0.05}))), false);
  assert.equal(validContour([...outline.slice(0,2),{x:2,y:2},...outline.slice(3)]), false);
  const look = { hex:"#BB2233",shape:"oval",finish:"gloss",length:"medium",fit:1,placement:0,opacity:0.8,precisionOnly:true,contours:{} };
  assert.equal(drawArNails({}, [hand], params, look, 0), 0);
  assert.ok(ar.includes("precisionOnly: precisionRef.current"));
  assert.ok(ar.includes("contourRef.current = next"));
});

test("zoom crop remains inside original camera photo boundaries", () => {
  const crop = boundsForNail(pose, 960, 1280);
  assert.ok(crop.left >= 0 && crop.top >= 0);
  assert.ok(crop.left + crop.width <= 960);
  assert.ok(crop.top + crop.height <= 1280);
});

test("explicit opt-in manual boundary editor supports undo, reset, and camera frame freeze", () => {
  assert.match(editor, /REQUIRED_POINTS = 8/);
  assert.match(editor, /onPointerDown=\{placePoint\}/);
  assert.match(editor, /validContour\(local\)/);
  assert.match(editor, /setDraft\(points => points\.slice\(0, -1\)\)/);
  assert.match(editor, /onReset\(finger\)/);
  assert.match(ar, /createImageBitmap\(video\)/);
  assert.match(ar, /Πάγωσε και χάραξε νύχια/);
  assert.match(ar, /setPrecisionOnly\(true\)/);
  assert.doesNotMatch(editor, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/);
});
