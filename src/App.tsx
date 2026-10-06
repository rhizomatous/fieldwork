import { useRef, useState, useSyncExternalStore } from "react";

import "./App.css";
import { AgentPanel } from "./components/AgentPanel.tsx";
import { BootConsole } from "./components/BootConsole.tsx";
import { Header } from "./components/Header.tsx";
import { InferencePanel } from "./components/InferencePanel.tsx";
import { LinuxPanel } from "./components/LinuxPanel.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import type { Session } from "./types.ts";

export function App({ session }: { session: Session }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const mount = useRef<HTMLDivElement>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  return (
    <>
      <Header />
      <main className="workbench">
        <div className="left-column">
          <AgentPanel state={state} session={session} />
          <div className="runtime-panels">
            <InferencePanel state={state} session={session} />
            <LinuxPanel
              state={state}
              onReset={() => session.reset()}
              onBoot={() => mount.current && session.boot(mount.current)}
              consoleOpen={consoleOpen}
              onToggleConsole={() => setConsoleOpen(!consoleOpen)}
            />
          </div>
        </div>
        <PreviewPanel state={state} session={session} />
      </main>
      <BootConsole
        open={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        mountRef={mount}
        diagnostics={state.diagnostics}
        bootStarted={state.bootStarted}
        linuxStatus={state.linuxStatus}
      />
    </>
  );
}
