"use client";

import LeftSidebar from "./LeftSidebar";
import CenterWorkspace from "../workspace/CenterWorkspace";
import RightPanel from "./RightPanel";
import BottomTimeline from "./BottomTimeline";
import TopBar from "./TopBar";
import { T } from "../editorTheme";

export default function EditorLayout() {
  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: T.bg }}>
      {/* Top bar */}
      <TopBar />

      {/* Main 3-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <LeftSidebar />

        {/* Center workspace */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <CenterWorkspace />

          {/* Bottom timeline */}
          <BottomTimeline />
        </div>

        {/* Right properties panel */}
        <RightPanel />
      </div>
    </div>
  );
}
