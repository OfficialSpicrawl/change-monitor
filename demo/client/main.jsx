// Client for the demo page (bundled to demo/public/app.js by scripts/demo-build.mjs).
import { mountInstall } from "./islands.jsx";
import { initAgent } from "./agent.js";
import { initWatch } from "./watch.js";

const install = document.getElementById("install");
if (install) mountInstall(install);
initWatch();
initAgent();
