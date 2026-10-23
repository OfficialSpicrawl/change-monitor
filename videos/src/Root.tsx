import { Composition } from "remotion";
import { Film, type FilmProps } from "./Film";
import { DURATION, FPS } from "./cues";

export const Root = () => (
  <Composition
    id="ChangeMonitor"
    component={Film}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={Math.round(DURATION * FPS)}
    defaultProps={{ fps: FPS, debug: false } satisfies FilmProps}
    // fps comes from props: 30 for review, 120 for the final master (4 subframes per frame).
    calculateMetadata={({ props }) => ({ fps: props.fps, durationInFrames: Math.round(DURATION * props.fps) })}
  />
);
