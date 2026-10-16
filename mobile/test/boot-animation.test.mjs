import assert from "node:assert/strict";
import test from "node:test";
import {existsSync,readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const bootPath=resolve(root,"src/components/CompanionBootSplash.tsx");
const boot=readFileSync(bootPath,"utf8");
const layout=readFileSync(resolve(root,"src/app/_layout.tsx"),"utf8");
const manifest=JSON.parse(readFileSync(resolve(root,"app.json"),"utf8"));

test("animated boot uses the real bundled official logo, not an invented wordmark",()=>{
 assert.equal(existsSync(resolve(root,"assets/icon.png")),true);
 assert.match(boot,/require\("\.\.\/\.\.\/assets\/icon\.png"\)/);
 assert.match(boot,/const GRID=3/);
 assert.match(boot,/Animated\.View/);
 assert.match(boot,/Animated\.Image/);
 assert.match(boot,/useNativeDriver:true/);
});
test("white native splash transfers to first-render animated overlay",()=>{
 const splash=manifest.expo.plugins.find(x=>Array.isArray(x)&&x[0]==="expo-splash-screen");
 assert.equal(splash?.[1]?.backgroundColor,"#FFFFFF");
 assert.match(boot,/backgroundColor:"#FFFFFF"/);
 assert.match(layout,/SplashScreen\.preventAutoHideAsync/);
 assert.match(layout,/SplashScreen\.hideAsync/);
 assert.match(layout,/<CompanionBootSplash ready=\{layoutReady\}/);
});
test("startup effect avoids repeated animations and respects accessibility settings",()=>{
 assert.match(boot,/started\.current/);
 assert.match(boot,/AccessibilityInfo\.isReduceMotionEnabled/);
 assert.match(boot,/onComplete\(\)/);
 assert.match(boot,/stopAnimation\(\)/);
 assert.match(layout,/bootComplete/);
});
