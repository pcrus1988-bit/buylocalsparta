/**
 * NYXI Agent 3 — private exploratory CIEDE2000 distance.
 * Pure function. Not an instrument-calibrated color measurement, review or publication grant.
 * Callers must enforce exact provenance, rights, and profile compatibility separately.
 */
const rad = x => x * Math.PI / 180;
const deg = x => x * 180 / Math.PI;
const mod = x => (x % 360 + 360) % 360;
function lab(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(x => typeof x === 'number' && Number.isFinite(x))) throw new TypeError('INVALID_LAB');
  if (v[0] < 0 || v[0] > 100 || Math.abs(v[1]) > 200 || Math.abs(v[2]) > 200) throw new RangeError('LAB_OUT_OF_RANGE');
  return v;
}
/** CIEDE2000, kL=kC=kH=1; reference conditions, no viewing-condition correction. */
export function deltaE2000(left, right) {
  const [L1,a1,b1] = lab(left), [L2,a2,b2] = lab(right);
  const C1 = Math.hypot(a1,b1), C2 = Math.hypot(a2,b2);
  const meanC = (C1+C2)/2;
  const pow7 = x => x ** 7;
  const G = .5 * (1 - Math.sqrt(pow7(meanC)/(pow7(meanC)+pow7(25))));
  const ap1 = (1+G)*a1, ap2 = (1+G)*a2;
  const Cp1 = Math.hypot(ap1,b1), Cp2 = Math.hypot(ap2,b2);
  const h1 = Cp1 < 1e-12 ? 0 : mod(deg(Math.atan2(b1,ap1)));
  const h2 = Cp2 < 1e-12 ? 0 : mod(deg(Math.atan2(b2,ap2)));
  const dL = L2-L1, dC = Cp2-Cp1;
  let dh = 0;
  if (Cp1*Cp2 > 1e-12) {
    dh = h2-h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2*Math.sqrt(Cp1*Cp2)*Math.sin(rad(dh/2));
  const meanL = (L1+L2)/2, meanCp = (Cp1+Cp2)/2;
  let meanH = h1+h2;
  if (Cp1*Cp2 < 1e-12) meanH = h1+h2;
  else if (Math.abs(h1-h2) <= 180) meanH = (h1+h2)/2;
  else if (h1+h2 < 360) meanH = (h1+h2+360)/2;
  else meanH = (h1+h2-360)/2;
  const T = 1 - .17*Math.cos(rad(meanH-30)) + .24*Math.cos(rad(2*meanH))
    + .32*Math.cos(rad(3*meanH+6)) - .20*Math.cos(rad(4*meanH-63));
  const dTheta = 30*Math.exp(-(((meanH-275)/25)**2));
  const Rc = 2*Math.sqrt(pow7(meanCp)/(pow7(meanCp)+pow7(25)));
  const Sl = 1 + (.015*(meanL-50)**2)/Math.sqrt(20+(meanL-50)**2);
  const Sc = 1 + .045*meanCp, Sh = 1 + .015*meanCp*T;
  const Rt = -Math.sin(rad(2*dTheta))*Rc;
  const u = dL/Sl, v = dC/Sc, w = dH/Sh;
  return Math.sqrt(Math.max(0,u*u+v*v+w*w+Rt*v*w));
}
