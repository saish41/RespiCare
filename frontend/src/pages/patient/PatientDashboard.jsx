import {
  Activity,
  Bell,
  ChevronRight,
  CircleUserRound,
  HeartPulse,
  Pill,
  Signal,
  Stethoscope,
  UserRound,
  UsersRound,
  Wifi,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import RespiratoryWaveform from "../../components/RespiratoryWaveform";


export default function PatientDashboard() {
  const { user } = useAuth();

  const [monitoring, setMonitoring] = useState(null);
  const [connections, setConnections] = useState([]);
  const [medications, setMedications] = useState([]);

  const [monitoringError, setMonitoringError] =
    useState(false);


  // =====================================================
  // MONITORING
  // =====================================================

  const fetchMonitoring = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await api.get(
        `/monitoring/patient/${user.id}/current`
      );

      setMonitoring(response.data);
      setMonitoringError(false);
    } catch (error) {
      console.error(
        "Monitoring error:",
        error
      );

      setMonitoringError(true);
    }
  }, [user?.id]);


  // =====================================================
  // CONNECTIONS
  // =====================================================

  const fetchConnections = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-connections"
      );

      setConnections(
        response.data || []
      );
    } catch (error) {
      console.error(
        "Connection error:",
        error
      );
    }
  }, []);


  // =====================================================
  // MEDICATIONS
  // =====================================================

  const fetchMedications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await api.get(
        `/medications/patient/${user.id}`
      );

      setMedications(
        response.data || []
      );
    } catch (error) {
      console.error(
        "Medication error:",
        error
      );
    }
  }, [user?.id]);


  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    fetchMonitoring();
    fetchConnections();
    fetchMedications();

    /*
      Respiratory data refreshes frequently.

      Connections and medications do NOT need
      to be fetched every 500ms.
    */

    const monitoringInterval =
      setInterval(
        fetchMonitoring,
        500
      );

    const careInterval =
      setInterval(() => {
        fetchConnections();
        fetchMedications();
      }, 15000);


    return () => {
      clearInterval(
        monitoringInterval
      );

      clearInterval(
        careInterval
      );
    };
  }, [
    fetchMonitoring,
    fetchConnections,
    fetchMedications,
  ]);


  // =====================================================
  // MONITORING STATE
  // =====================================================

  const rate =
    monitoring?.respiratory_rate ?? null;

  const quality =
    monitoring?.signal_quality || "UNKNOWN";

  const pattern =
    monitoring?.pattern || "NO_DATA";

  const mode =
    monitoring?.mode || "LIVE";


  const hasSignal =
    monitoring?.status === "MONITORING" &&
    rate !== null &&
    quality !== "UNKNOWN" &&
    quality !== "UNRELIABLE";


  /*
    Simulation can provide a simulated volume.

    Live Wi-Fi CSI does NOT claim to measure
    tidal volume in mL.
  */

  const amplitude =
    hasSignal
      ? monitoring?.simulated_volume != null
        ? monitoring.simulated_volume / 587
        : 1
      : 0;


  /*
    Temporary baseline until the respiratory
    detector provides the real rolling baseline.

    We only display it while valid monitoring
    exists.
  */

  const baseline =
    hasSignal ? 15 : null;


  const deviation =
    rate !== null &&
    baseline !== null
      ? Number(
          (
            rate -
            baseline
          ).toFixed(1)
        )
      : null;


  const status =
    getRespiratoryStatus(
      hasSignal,
      pattern,
      quality
    );


  // =====================================================
  // CONNECTION STATE
  // =====================================================

  const familyConnections =
    connections.filter(
      (connection) =>
        connection.role === "FAMILY"
    );


  const doctorConnections =
    connections.filter(
      (connection) =>
        connection.role === "DOCTOR"
    );


  // =====================================================
  // MEDICATION STATE
  // =====================================================

  const completedMedicationCount =
    medications.filter(
      (medication) =>
        medication.today?.taken
    ).length;


  return (
    <div className="patient-dashboard-page">

      {/* ================================================= */}
      {/* HEADER                                            */}
      {/* ================================================= */}

      <header className="patient-top-header">

        <div>
          <p className="page-eyebrow">
            RESPIRATORY DASHBOARD
          </p>

          <h1>
            Hello,{" "}
            {getFirstName(
              user?.name
            )}
          </h1>

          <p>
            Your breathing and care overview,
            updated continuously.
          </p>
        </div>


        <div className="patient-header-actions">

          <button
            className="round-header-button"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>


          <div className="header-profile">

            <div className="header-avatar">
              <UserRound size={19} />
            </div>

            <div>
              <strong>
                {user?.name}
              </strong>

              <span>
                Patient
              </span>
            </div>

          </div>

        </div>

      </header>


      {monitoringError && (
        <div className="dashboard-error">
          Unable to reach respiratory monitoring.
          Trying again automatically.
        </div>
      )}


      {/* ================================================= */}
      {/* CURRENT RESPIRATORY STATUS                        */}
      {/* ================================================= */}

      <section className="current-status-card">

        <div className="section-title-row">

          <div>
            <span className="section-kicker">
              CURRENT STATUS
            </span>

            <h2>
              Respiratory Monitoring
            </h2>
          </div>


          <div
            className={
              hasSignal
                ? "monitoring-pill online"
                : "monitoring-pill"
            }
          >

            <span />

            {hasSignal
              ? mode === "DEMO"
                ? "Simulation Active"
                : "Monitoring Live"
              : "Waiting for Signal"}

          </div>

        </div>


        <div className="status-hero-grid">

          {/* ============================================= */}
          {/* LUNG VISUAL                                   */}
          {/* ============================================= */}

          <div className="lung-status-block">

            <div
              className={
                `lung-visual ${status.className}`
              }
            >
              <LungGraphic />
            </div>


            <div>

              <span className="tiny-label">
                RESPIRATORY STATE
              </span>


              <div
                className={
                  `large-health-status ${status.className}`
                }
              >

                <span className="health-status-dot" />

                {status.label}

              </div>


              <p>
                {status.description}
              </p>

            </div>

          </div>


          {/* ============================================= */}
          {/* STATUS METRICS                                */}
          {/* ============================================= */}

          <div className="hero-metrics">

            <Metric
              label="Current BPM"
              value={
                rate !== null
                  ? formatNumber(rate)
                  : "--"
              }
              suffix={
                rate !== null
                  ? "BPM"
                  : ""
              }
            />


            <Metric
              label="Baseline"
              value={
                baseline !== null
                  ? baseline
                  : "--"
              }
              suffix={
                baseline !== null
                  ? "BPM"
                  : ""
              }
            />


            <Metric
              label="Deviation"
              value={
                deviation !== null
                  ? deviation > 0
                    ? `+${deviation}`
                    : deviation
                  : "--"
              }
              suffix={
                deviation !== null
                  ? "BPM"
                  : ""
              }
            />


            <Metric
              label="Signal"
              value={
                hasSignal
                  ? quality
                  : "--"
              }
            />

          </div>

        </div>

      </section>


      {/* ================================================= */}
      {/* LIVE WAVEFORM                                     */}
      {/* ================================================= */}

      <section className="patient-wave-card">

        <div className="patient-wave-header">

          <div>

            <div className="wave-heading">

              <Activity size={19} />

              <h2>
                Live Respiratory Waveform
              </h2>

            </div>


            <p>
              Respiratory motion signal
            </p>

          </div>


          <div className="wave-header-right">

            <div
              className={
                hasSignal
                  ? "signal-chip good"
                  : "signal-chip"
              }
            >

              <Signal size={14} />

              {hasSignal
                ? quality
                : "NO SIGNAL"}

            </div>


            <strong>

              {rate !== null
                ? formatNumber(rate)
                : "--"}

              <small>
                {" "}BPM
              </small>

            </strong>

          </div>

        </div>


        <RespiratoryWaveform
          respiratoryRate={
            hasSignal
              ? rate
              : null
          }

          amplitude={
            hasSignal
              ? amplitude
              : 0
          }

          signalQuality={
            hasSignal
              ? quality
              : "UNKNOWN"
          }

          pattern={
            hasSignal
              ? pattern
              : "NO_DATA"
          }

          active={
            hasSignal
          }
        />


        {!hasSignal && (

          <div className="wave-offline-caption">

            <Wifi size={15} />

            Waiting for a valid respiratory
            signal. The waveform remains flat
            until monitoring begins.

          </div>

        )}

      </section>


      {/* ================================================= */}
      {/* SUMMARY + CARE TEAM                               */}
      {/* ================================================= */}

      <div className="patient-information-grid">

        {/* ============================================= */}
        {/* SUMMARY                                       */}
        {/* ============================================= */}

        <section className="modern-info-card">

          <div className="info-card-heading">

            <div>

              <span className="section-kicker">
                TODAY
              </span>

              <h3>
                Today's Summary
              </h3>

            </div>


            <HeartPulse size={21} />

          </div>


          <div className="summary-list">

            <SummaryRow
              label="Current BPM"
              value={
                rate !== null
                  ? `${formatNumber(rate)} BPM`
                  : "--"
              }
            />


            <SummaryRow
              label="Respiratory Pattern"
              value={
                hasSignal
                  ? formatPattern(pattern)
                  : "--"
              }
            />


            <SummaryRow
              label="Signal Quality"
              value={
                hasSignal
                  ? quality
                  : "--"
              }
            />


            <SummaryRow
              label="Monitoring Source"
              value={
                hasSignal
                  ? mode === "DEMO"
                    ? "Simulation"
                    : "ESP32 CSI"
                  : "Offline"
              }
            />

          </div>

        </section>


        {/* ============================================= */}
        {/* CARE TEAM                                     */}
        {/* ============================================= */}

        <section className="modern-info-card care-team-card">

          <div className="info-card-heading">

            <div>

              <span className="section-kicker">
                CONNECTED CARE
              </span>

              <h3>
                Guardians & Doctors
              </h3>

            </div>


            <UsersRound size={21} />

          </div>


          <div className="care-team-list">

            {connections.length === 0 ? (

              <div className="empty-care-team">

                <div className="empty-care-icon">
                  <UsersRound size={23} />
                </div>


                <div>

                  <strong>
                    No care team connected yet
                  </strong>

                  <span>
                    Connect a family guardian
                    or doctor from the Care Team
                    tab.
                  </span>

                </div>

              </div>

            ) : (

              <>

                {familyConnections.map(
                  (connection) => (

                    <CarePerson
                      key={
                        connection.connection_id
                      }

                      name={
                        connection.name
                      }

                      role="Family Guardian"

                      type="family"
                    />

                  )
                )}


                {doctorConnections.map(
                  (connection) => (

                    <CarePerson
                      key={
                        connection.connection_id
                      }

                      name={
                        formatDoctorName(
                          connection.name
                        )
                      }

                      role="Doctor"

                      type="doctor"
                    />

                  )
                )}

              </>

            )}

          </div>


          <Link
            to="/patient/connections"
            className="outline-care-button"
          >

            <UsersRound size={16} />

            Manage Care Team

            <ChevronRight size={15} />

          </Link>

        </section>

      </div>


      {/* ================================================= */}
      {/* MEDICATION                                       */}
      {/* ================================================= */}

      <section className="medication-dashboard-card">

        <div className="medication-dashboard-header">

          <div>

            <span className="section-kicker">
              CARE PLAN
            </span>

            <h2>
              Today's Medication
            </h2>

            <p>
              Your current medication schedule
              and today's adherence.
            </p>

          </div>


          <div className="medication-header-side">

            {medications.length > 0 && (

              <div className="medication-completion-pill">

                {completedMedicationCount}
                /
                {medications.length}

                <span>
                  taken
                </span>

              </div>

            )}


            <div className="medication-icon">
              <Pill size={23} />
            </div>

          </div>

        </div>


        <div className="medication-list">

          {medications.length === 0 ? (

            <div className="dashboard-empty-medication">

              <div className="medicine-symbol">
                <Pill size={17} />
              </div>


              <div>

                <strong>
                  No medication scheduled
                </strong>

                <span>
                  Prescriptions from your
                  connected doctor will
                  automatically appear here.
                </span>

              </div>

            </div>

          ) : (

            medications
              .slice(0, 4)
              .map(
                (medication) => (

                  <DashboardMedication
                    key={
                      medication.id
                    }

                    medication={
                      medication
                    }
                  />

                )
              )

          )}

        </div>


        <Link
          to="/patient/medications"
          className="view-medications-link"
        >

          View medication schedule

          <ChevronRight size={16} />

        </Link>

      </section>

    </div>
  );
}


/* =====================================================
   METRIC
===================================================== */

function Metric({
  label,
  value,
  suffix,
}) {
  return (
    <div className="hero-metric">

      <span>
        {label}
      </span>

      <strong>

        {value}

        {suffix && (
          <small>
            {" "}
            {suffix}
          </small>
        )}

      </strong>

    </div>
  );
}


/* =====================================================
   SUMMARY ROW
===================================================== */

function SummaryRow({
  label,
  value,
}) {
  return (
    <div className="summary-row">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


/* =====================================================
   CARE PERSON
===================================================== */

function CarePerson({
  name,
  role,
  type,
}) {
  return (
    <div className="care-person">

      <div
        className={
          `care-avatar ${type}`
        }
      >

        {type === "doctor" ? (
          <Stethoscope size={18} />
        ) : (
          <CircleUserRound size={18} />
        )}

      </div>


      <div className="care-person-info">

        <strong>
          {name}
        </strong>

        <span>
          {role}
        </span>

      </div>


      <div className="active-care-status">

        <span />

        Active

      </div>

    </div>
  );
}


/* =====================================================
   DASHBOARD MEDICATION
===================================================== */

function DashboardMedication({
  medication,
}) {
  const taken =
    medication.today?.taken;


  return (
    <div
      className={
        taken
          ? "medication-row medication-row-taken"
          : "medication-row"
      }
    >

      <div className="medicine-time">

        <span>
          {medication.schedule}
        </span>

      </div>


      <div className="medicine-main">

        <div className="medicine-symbol">
          <Pill size={17} />
        </div>


        <div>

          <strong>
            {medication.medicine_name}
          </strong>

          <span>
            {medication.dosage}
          </span>

        </div>

      </div>


      <div className="medicine-status">

        <span
          className={
            taken
              ? "dashboard-dose-status taken"
              : "dashboard-dose-status"
          }
        >

          {taken
            ? "Taken"
            : "Pending"}

        </span>


        {taken &&
          medication.today?.marked_by && (

            <small className="dashboard-marked-by">
              by{" "}
              {
                medication.today
                  .marked_by
              }
            </small>

          )}

      </div>

    </div>
  );
}


/* =====================================================
   RESPICARE LUNGS
===================================================== */

function LungGraphic() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="lung-svg"
      aria-label="Respiratory status"
    >

      {/* LEFT LUNG */}

      <path
        d="
          M56 24
          C52 34 50 42 48 52
          C44 44 39 39 34 39
          C23 39 16 52 13 66
          C10 81 15 94 26 96
          C38 98 48 87 51 72
          L56 24
        "
        fill="currentColor"
        opacity="0.88"
      />


      {/* RIGHT LUNG */}

      <path
        d="
          M64 24
          C68 34 70 42 72 52
          C76 44 81 39 86 39
          C97 39 104 52 107 66
          C110 81 105 94 94 96
          C82 98 72 87 69 72
          L64 24
        "
        fill="currentColor"
        opacity="0.88"
      />


      {/* TRACHEA */}

      <path
        d="M60 17 L60 64"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />


      {/* LEFT BRONCHUS */}

      <path
        d="M60 47 L44 63"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />


      {/* RIGHT BRONCHUS */}

      <path
        d="M60 47 L76 63"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />

    </svg>
  );
}


/* =====================================================
   RESPIRATORY STATUS
===================================================== */

function getRespiratoryStatus(
  hasSignal,
  pattern,
  quality
) {
  if (!hasSignal) {
    return {
      label: "Offline",
      className: "offline",
      description:
        "Waiting for respiratory monitoring data.",
    };
  }


  if (
    pattern === "MOTION_ARTIFACT"
  ) {
    return {
      label: "Motion Detected",
      className: "watch",
      description:
        "Movement is interfering with respiratory analysis.",
    };
  }


  if (
    quality === "POOR"
  ) {
    return {
      label: "Signal Check",
      className: "watch",
      description:
        "Respiratory signal quality is currently reduced.",
    };
  }


  if (
    pattern === "NORMAL"
  ) {
    return {
      label: "Normal",
      className: "normal",
      description:
        "Breathing pattern is close to the current baseline.",
    };
  }


  if (
    pattern === "RECOVERY"
  ) {
    return {
      label: "Recovering",
      className: "normal",
      description:
        "Respiratory pattern is returning toward baseline.",
    };
  }


  if (
    pattern === "FAST" ||
    pattern === "RAPID_BREATHING" ||
    pattern === "SLOW" ||
    pattern === "SLOW_BREATHING" ||
    pattern === "SHALLOW" ||
    pattern === "SHALLOW_BREATHING"
  ) {
    return {
      label: "Pattern Change",
      className: "watch",
      description:
        "A sustained change from the respiratory baseline is being monitored.",
    };
  }


  if (
    pattern === "BREATHING_PAUSE" ||
    pattern === "RESPIRATORY_DISTURBANCE"
  ) {
    return {
      label: "Disturbance",
      className: "watch",
      description:
        "A respiratory-pattern disturbance is currently being monitored.",
    };
  }


  return {
    label: "Monitoring",
    className: "normal",
    description:
      "Respiratory monitoring is active.",
  };
}


/* =====================================================
   FORMAT HELPERS
===================================================== */

function formatPattern(value) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


function formatNumber(value) {
  const number =
    Number(value);

  if (
    Number.isNaN(number)
  ) {
    return value;
  }

  return Number.isInteger(number)
    ? number
    : number.toFixed(1);
}


function getFirstName(name) {
  if (!name) {
    return "there";
  }

  return name
    .trim()
    .split(/\s+/)[0];
}


function formatDoctorName(name) {
  if (!name) {
    return "Doctor";
  }

  if (
    name
      .trim()
      .toLowerCase()
      .startsWith("dr.")
  ) {
    return name;
  }

  return `Dr. ${name}`;
}