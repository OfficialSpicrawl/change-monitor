// OpenPanel analytics, only when OPENPANEL_CLIENT_ID is set. The client ID is public (it ships in the page).
// OPENPANEL_API_URL points at a self-hosted OpenPanel; empty means the hosted service.
const SDK = "https://openpanel.dev/op1.js";
const HOSTED_API = "https://api.openpanel.dev";

const clientId = (env) => (/^[\w-]+$/.test(String(env.OPENPANEL_CLIENT_ID || "")) ? env.OPENPANEL_CLIENT_ID : "");
const apiUrl = (env) => {
  try {
    const url = new URL(String(env.OPENPANEL_API_URL || HOSTED_API));
    return url.protocol === "https:" ? url.href.replace(/\/$/, "") : HOSTED_API;
  } catch {
    return HOSTED_API;
  }
};

// Extra CSP sources the tag needs: the SDK's host for script-src, the API's origin for connect-src.
export const openpanelCsp = (env) =>
  clientId(env) ? { script: ` ${new URL(SDK).origin}`, connect: ` ${new URL(apiUrl(env)).origin}` } : { script: "", connect: "" };

// The tag: a queue stub plus init (inline, so it carries the page nonce), then the SDK itself.
// Every event carries `tool`, so one OpenPanel project can tell the three demos apart.
export function openpanelTag(env, nonce, tool) {
  const id = clientId(env);
  if (!id) return "";
  const init = { clientId: id, apiUrl: apiUrl(env), trackScreenViews: true, trackOutgoingLinks: true };
  return `<script nonce="${nonce}">window.op=window.op||function(){(window.op.q=window.op.q||[]).push(arguments)};window.op("init",${JSON.stringify(init)});window.op("setGlobalProperties",${JSON.stringify({ tool })});</script>
<script async src="${SDK}" nonce="${nonce}"></script>`;
}
