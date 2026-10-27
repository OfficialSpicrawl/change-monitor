// A tiny store so the plain DOM code can drive a React island.
export const makeStore = (initial) => {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(next) {
      value = next;
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
};
export const botState = makeStore("default"); // "default" is the idle state of bot-avatars; "working" while a command runs

