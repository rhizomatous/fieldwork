import "./App.css";
import { useRef, useState, useSyncExternalStore } from "react";

import { AgentPanel } from "./components/AgentPanel.jsx";
import { BootConsole } from "./components/BootConsole.jsx";
import { Header } from "./components/Header.jsx";
import { InferencePanel } from "./components/InferencePanel.jsx";
import { LinuxPanel } from "./components/LinuxPanel.jsx";
import { PreviewPanel } from "./components/PreviewPanel.jsx";

export function App({ session }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const mount = useRef(null);
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
              onBoot={() => session.boot(mount.current)}
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
