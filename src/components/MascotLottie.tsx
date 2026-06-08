"use client";

import Lottie from "lottie-react";
import runningData     from "../../public/lottie/mascot-running.json";
import celebratingData from "../../public/lottie/mascot-celebrating.json";
import confusedData    from "../../public/lottie/mascot-confused.json";
import thinkingData    from "../../public/lottie/mascot-thinking.json";
import thumbsupData    from "../../public/lottie/mascot-thumbsup.json";

export type MascotState = "running" | "celebrating" | "confused" | "thinking" | "thumbsup";

const ANIM_DATA = {
  running:     runningData,
  celebrating: celebratingData,
  confused:    confusedData,
  thinking:    thinkingData,
  thumbsup:    thumbsupData,
} as const;

interface Props {
  state: MascotState;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
}

export default function MascotLottie({ state, className, style, loop = true }: Props) {
  return (
    <Lottie
      animationData={ANIM_DATA[state]}
      loop={loop}
      autoplay
      className={className}
      style={style}
      rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
    />
  );
}
