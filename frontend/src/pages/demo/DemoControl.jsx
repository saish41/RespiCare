import {
  Activity,
  FlaskConical,
  Gauge,
  Play,
  Radio,
  Square,
  TriangleAlert,
  Wifi,
  Wind,
} from "lucide-react";

import { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import RespiratoryWaveform from "../../components/RespiratoryWaveform";

const breathingScenarios = [
  {
    value: "NORMAL",
    name: "Normal",
    description: "Stable baseline breathing.",
    rate: "15 BPM",
    volume: "587 mL",
  },

  {
    value: "FAST",
    name: "Fast Breathing",
    description: "Breathing gradually becomes faster.",
    rate: "15 → 25 BPM",
    volume: "587 → 500 mL",
  },

  {
    value: "SLOW",
    name: "Slow Breathing",
    description: "Breathing gradually becomes slower.",
    rate: "15 → 7 BPM",
    volume: "587 → 500 mL",
  },

  {
    value: "SHALLOW",
    name: "Shallow Breathing",
    description: "Breathing becomes faster and much shallower.",
    rate: "15 → 24 BPM",
    volume: "587 → 220 mL",
  },

  {
    value: "ASTHMA_ATTACK",
    name: "Asthma-like Distress",
    description:
      "Breathing progressively becomes faster, shallower and more irregular.",
    rate: "15 → 30 BPM",
    volume: "587 → 180 mL",
  },

  {
    value: "BREATHING_PAUSE",
    name: "Breathing Pause",
    description: "Breathing slows while longer pauses begin appearing.",
    rate: "15 → 8 BPM",
    volume: "587 → 350 mL",
  },

  {
    value: "RECOVERY",
    name: "Recovery",
    description: "Respiratory pattern gradually returns to baseline.",
    rate: "24 → 15 BPM",
    volume: "300 → 587 mL",
  },
];

const technicalScenarios = [
  {
    value: "MOTION_ARTIFACT",
    name: "Motion Artifact",
    description: "Movement interferes with respiratory analysis.",
  },
  {
    value: "SIGNAL_LOSS",
    name: "Signal Loss",
    description: "No reliable respiratory signal is available.",
  },
];

export default function DemoControl() {
  const { user } = useAuth();

  const [source, setSource] = useState("LIVE");
  const [selected, setSelected] = useState("NORMAL");
  const [monitoring, setMonitoring] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const fetchMonitoring = async () => {
    if (!user?.id) return;

    try {
      const response = await api.get(
        `/monitoring/patient/${user.id}/current`
      );

      setMonitoring(response.data);

      if (response.data.mode === "DEMO") {
        setSource("SIMULATION");
        setRunning(true);

        if (response.data.scenario) {
          setSelected(response.data.scenario);
        }
      } else {
        setRunning(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMonitoring();

    const interval = setInterval(fetchMonitoring, 400);

    return () => clearInterval(interval);
  }, [user?.id]);

  const selectLiveMode = async () => {
    try {
      if (running) {
        await api.post(
          `/monitoring/patient/${user.id}/simulation/stop`
        );
      }

      setSource("LIVE");
      setRunning(false);
      setMonitoring(null);
      setError("");

      await fetchMonitoring();
    } catch {
      setError("Unable to switch to live monitoring.");
    }
  };

  const selectSimulationMode = async () => {
    /*
      IMPORTANT:
      Selecting SIMULATION does NOT automatically
      start fake respiratory data.

      The waveform stays flat until Start Simulation.
    */

    if (running) {
      try {
        await api.post(
          `/monitoring/patient/${user.id}/simulation/stop`
        );
      } catch {
        // Safe to continue into ready state.
      }
    }

    setSource("SIMULATION");
    setRunning(false);
    setMonitoring(null);
    setError("");
  };

  const startScenario = async (scenario = selected) => {
    if (source !== "SIMULATION") {
      return;
    }

    try {
      await api.post(
        `/monitoring/patient/${user.id}/simulation/start`,
        {
          scenario,
        }
      );

      setSelected(scenario);
      setRunning(true);
      setError("");

      await fetchMonitoring();
    } catch (err) {
      setError(
        err.response?.data?.detail || "Unable to start simulation."
      );
    }
  };

  const stopSimulation = async () => {
    try {
      await api.post(
        `/monitoring/patient/${user.id}/simulation/stop`
      );

      setRunning(false);
      setMonitoring(null);
      setError("");
    } catch {
      setError("Unable to stop simulation.");
    }
  };

  const changeScenario = async (scenario) => {
    setSelected(scenario);

    if (running && source === "SIMULATION") {
      await startScenario(scenario);
    }
  };

  const isSimulation = source === "SIMULATION";

  const rate =
    isSimulation && running
      ? monitoring?.respiratory_rate
      : source === "LIVE"
      ? monitoring?.respiratory_rate
      : null;

  const volume =
    isSimulation && running
      ? monitoring?.simulated_volume
      : null;

  const signalQuality = monitoring?.signal_quality || "UNKNOWN";

  const pattern = monitoring?.pattern || "NO_DATA";

  const hasLiveSignal =
    source === "LIVE" &&
    monitoring?.mode === "LIVE" &&
    monitoring?.status === "MONITORING" &&
    rate != null;

  const hasSimulationSignal =
    isSimulation &&
    running &&
    rate != null &&
    signalQuality !== "UNRELIABLE";

  const waveformActive = hasLiveSignal || hasSimulationSignal;

  const amplitude =
    volume != null
      ? volume / 587
      : waveformActive
      ? 1
      : 0;

  return (
    <>
      <header className="dashboard-header simulation-header">
        <div>
          <p className="page-eyebrow">RESPICARE LAB</p>

          <h1>Monitoring Source</h1>

          <p>
            Switch between the real ESP32 source and the controlled
            respiratory simulator.
          </p>
        </div>

        <div className="mode-badge demo">
          <FlaskConical size={14} />
          Testing Environment
        </div>
      </header>

      <section className="source-switch-card">
        <button
          className={
            source === "LIVE"
              ? "source-option active"
              : "source-option"
          }
          onClick={selectLiveMode}
        >
          <div className="source-option-icon">
            <Radio size={21} />
          </div>

          <div>
            <strong>Live Monitoring</strong>
            <span>ESP32 Wi-Fi CSI</span>
          </div>

          <div className="source-radio">
            <span />
          </div>
        </button>

        <button
          className={
            source === "SIMULATION"
              ? "source-option active simulation-source"
              : "source-option simulation-source"
          }
          onClick={selectSimulationMode}
        >
          <div className="source-option-icon">
            <FlaskConical size={21} />
          </div>

          <div>
            <strong>Simulation</strong>
            <span>Controlled testing source</span>
          </div>

          <div className="source-radio">
            <span />
          </div>
        </button>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      {source === "LIVE" ? (
        <section className="dashboard-card source-live-panel">
          <div className="source-live-status">
            <div
              className={
                hasLiveSignal
                  ? "large-source-icon online"
                  : "large-source-icon"
              }
            >
              <Wifi size={30} />
            </div>

            <div>
              <span className="mini-label">LIVE SENSOR SOURCE</span>

              <h2>
                {hasLiveSignal
                  ? "ESP32 connected"
                  : "Waiting for monitoring device"}
              </h2>

              <p>
                {hasLiveSignal
                  ? "Respiratory data is currently being received."
                  : "The respiratory waveform will remain flat until valid sensor data is received."}
              </p>
            </div>
          </div>

          <div className="source-wave">
            <RespiratoryWaveform
              respiratoryRate={hasLiveSignal ? rate : null}
              amplitude={hasLiveSignal ? 1 : 0}
              signalQuality={
                hasLiveSignal ? signalQuality : "UNKNOWN"
              }
              pattern={hasLiveSignal ? pattern : "NO_DATA"}
              active={hasLiveSignal}
            />
          </div>
        </section>
      ) : (
        <>
          <div className="simulation-notice">
            <TriangleAlert size={20} />

            <div>
              <strong>Controlled Simulation Environment</strong>

              <p>
                The values below are generated for demonstration and system
                testing. Simulated breath volume is not a measurement from
                Wi-Fi CSI.
              </p>
            </div>
          </div>

          <div className="simulation-layout">
            <section className="dashboard-card">
              <div className="card-heading">
                <div>
                  <h3>Breathing Scenarios</h3>
                  <p>Select a respiratory pattern to simulate.</p>
                </div>

                <span className="demo-label">DEMO</span>
              </div>

              <div className="scenario-list">
                {breathingScenarios.map((scenario) => (
                  <button
                    key={scenario.value}
                    className={
                      selected === scenario.value
                        ? "simulation-scenario selected"
                        : "simulation-scenario"
                    }
                    onClick={() => changeScenario(scenario.value)}
                  >
                    <div className="scenario-name">
                      <Activity size={17} />

                      <strong>{scenario.name}</strong>
                    </div>

                    <p>{scenario.description}</p>

                    <div className="scenario-metrics">
                      <span>{scenario.rate}</span>
                      <span>{scenario.volume}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="technical-heading">
                Technical Signal Tests
              </div>

              <div className="technical-scenarios">
                {technicalScenarios.map((scenario) => (
                  <button
                    key={scenario.value}
                    className={
                      selected === scenario.value
                        ? "technical-scenario selected"
                        : "technical-scenario"
                    }
                    onClick={() => changeScenario(scenario.value)}
                  >
                    <strong>{scenario.name}</strong>

                    <span>{scenario.description}</span>
                  </button>
                ))}
              </div>

              {!running ? (
                <button
                  className="primary-button simulation-start-button"
                  onClick={() => startScenario()}
                >
                  <Play size={17} />
                  Start Simulation
                </button>
              ) : (
                <button
                  className="stop-button"
                  onClick={stopSimulation}
                >
                  <Square size={16} />
                  Stop Simulation
                </button>
              )}
            </section>

            <section>
              <div className="simulation-metrics">
                <div className="simulation-metric">
                  <Gauge size={21} />

                  <div>
                    <span>Respiratory Rate</span>

                    <strong>
                      {running && rate != null ? rate : "--"}

                      <small> BPM</small>
                    </strong>
                  </div>
                </div>

                <div className="simulation-metric">
                  <Wind size={21} />

                  <div>
                    <span>Simulated Breath Volume</span>

                    <strong>
                      {running && volume != null ? volume : "--"}

                      <small> mL</small>
                    </strong>
                  </div>
                </div>
              </div>

              <div className="dashboard-card simulation-wave-card">
                <div className="card-heading">
                  <div>
                    <div className="live-title">
                      <span
                        className={
                          waveformActive
                            ? "live-dot"
                            : "live-dot offline"
                        }
                      />
                      Respiratory Signal
                    </div>

                    <p>
                      {running
                        ? formatPattern(pattern)
                        : "Simulation ready — no scenario running"}
                    </p>
                  </div>

                  <div className="wave-rate">
                    {running && rate != null ? rate : "--"}

                    <span> BPM</span>
                  </div>
                </div>

                <RespiratoryWaveform
                  respiratoryRate={waveformActive ? rate : null}
                  amplitude={waveformActive ? amplitude : 0}
                  signalQuality={
                    waveformActive ? signalQuality : "UNKNOWN"
                  }
                  pattern={waveformActive ? pattern : "NO_DATA"}
                  active={waveformActive}
                />

                <div className="simulation-state-row">
                  <div>
                    <span>Source</span>
                    <strong>Simulation</strong>
                  </div>

                  <div>
                    <span>Scenario</span>
                    <strong>
                      {running
                        ? formatPattern(selected)
                        : "Not running"}
                    </strong>
                  </div>

                  <div>
                    <span>Status</span>
                    <strong>
                      {running ? "Active" : "Ready"}
                    </strong>
                  </div>
                </div>

                {running && monitoring?.progress != null && (
                  <div className="simulation-progress">
                    <div className="progress-info">
                      <span>Scenario progression</span>

                      <strong>
                        {Math.round(monitoring.progress * 100)}%
                      </strong>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${monitoring.progress * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function formatPattern(value) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}