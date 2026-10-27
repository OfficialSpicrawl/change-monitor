// Client for the demo page (bundled to demo/public/app.js by scripts/demo-build.mjs). Import ./nonce.js first.
import "./nonce.js";
import { mountInstall } from "./islands.jsx";
import { initAgent } from "./agent.js";
import { initStars } from "./stars.js";
import { initWatch } from "./watch.js";

const install = document.getElementById("install");
if (install) mountInstall(install);
initWatch();
initAgent();
initStars();
