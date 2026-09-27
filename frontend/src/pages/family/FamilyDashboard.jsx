import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  HeartHandshake,
  HeartPulse,
  Link2,
  Loader2,
  Pill,
  Radio,
  ShieldCheck,
  Signal,
  UserRound,
  UsersRound,
  WifiOff,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import RespiratoryWaveform from "../../components/RespiratoryWaveform";


export default function FamilyDashboard() {
  const { user } = useAuth();

  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] =
    useState(null);

  const [monitoring, setMonitoring] = useState(null);
  const [medications, setMedications] = useState([]);

  const [loadingPatients, setLoadingPatients] =
    useState(true);

  const [updatingMedication, setUpdatingMedication] =
    useState(null);

  const [error, setError] = useState("");


  /* =====================================================
     HELPERS
  ===================================================== */

  const getPatientId = (patient) => {
    return (
      patient?.patient_id ??
      patient?.id ??
      patient?.patient?.id ??
      null
    );
  };


  const getPatientName = (patient) => {
    return (
      patient?.patient_name ??
      patient?.name ??
      patient?.patient?.name ??
      "Patient"
    );
  };


  /* =====================================================
     PATIENTS
  ===================================================== */

  const fetchPatients = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-patients"
      );

      const list = Array.isArray(response.data)
        ? response.data
        : [];

      setPatients(list);

      setSelectedPatientId((current) => {
        if (
          current &&
          list.some(
            (patient) =>
              getPatientId(patient) === current
          )
        ) {
          return current;
        }

        if (list.length > 0) {
          return getPatientId(list[0]);
        }

        return null;
      });

      setError("");
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load your connected patients."
      );
    } finally {
      setLoadingPatients(false);
    }
  }, []);


  /* =====================================================
     MONITORING
  ===================================================== */

  const fetchMonitoring = useCallback(async () => {
    if (!selectedPatientId) {
      setMonitoring(null);
      return;
    }

    try {
      const response = await api.get(
        `/monitoring/patient/${selectedPatientId}/current`
      );

      setMonitoring(response.data);
    } catch (err) {
      console.error(err);
      setMonitoring(null);
    }
  }, [selectedPatientId]);


  /* =====================================================
     MEDICATIONS
  ===================================================== */

  const fetchMedications = useCallback(async () => {
    if (!selectedPatientId) {
      setMedications([]);
      return;
    }

    try {
      const response = await api.get(
        `/medications/patient/${selectedPatientId}`
      );

      setMedications(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error(err);
      setMedications([]);
    }
  }, [selectedPatientId]);


  /* =====================================================
     INITIAL LOAD
  ===================================================== */

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);


  /* =====================================================
     POLLING
  ===================================================== */

  useEffect(() => {
    if (!selectedPatientId) {
      setMonitoring(null);
      setMedications([]);
      return;
    }

    fetchMonitoring();
    fetchMedications();

    const monitoringTimer = setInterval(
      fetchMonitoring,
      500
    );

    const medicationTimer = setInterval(
      fetchMedications,
      15000
    );

    return () => {
      clearInterval(monitoringTimer);
      clearInterval(medicationTimer);
    };
  }, [
    selectedPatientId,
    fetchMonitoring,
    fetchMedications,
  ]);


  /* =====================================================
     MEDICATION UPDATE
  ===================================================== */

  const toggleMedication = async (medication) => {
    try {
      setUpdatingMedication(medication.id);
      setError("");

      await api.post(
        "/medications/taken",
        {
          prescription_id: medication.id,
          taken: !medication.today?.taken,
        }
      );

      await fetchMedications();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to update medication."
      );
    } finally {
      setUpdatingMedication(null);
    }
  };


  /* =====================================================
     SELECTED PATIENT
  ===================================================== */

  const selectedPatient = useMemo(
    () =>
      patients.find(
        (patient) =>
          getPatientId(patient) ===
          selectedPatientId
      ),
    [patients, selectedPatientId]
  );


  const selectedPatientName =
    getPatientName(selectedPatient);


  /* =====================================================
     MONITORING VALUES
  ===================================================== */

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


  const baseline =
    hasSignal ? 15 : null;


  const deviation =
    rate !== null && baseline !== null
      ? Number((rate - baseline).toFixed(1))
      : null;


  const amplitude =
    hasSignal
      ? monitoring?.simulated_volume != null
        ? clamp(
            monitoring.simulated_volume / 587,
            0.15,
            1.2
          )
        : 1
      : 0;


  const status = getRespiratoryStatus(
    hasSignal,
    pattern,
    quality
  );


  /* =====================================================
     MEDICATION VALUES
  ===================================================== */

  const takenCount = medications.filter(
    (medication) =>
      medication.today?.taken
  ).length;


  const medicationPercent =
    medications.length > 0
      ? Math.round(
          (takenCount / medications.length) * 100
        )
      : 0;


  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="guardian-dashboard">

      {/* HEADER */}

      <header className="guardian-header">

        <div>
          <span className="guardian-eyebrow">
            FAMILY CARE CONSOLE
          </span>

          <h1>
            Good to see you,{" "}
            {firstName(user?.name)}
          </h1>

          <p>
            Stay close to the people you care
            about, even when you are not in the
            same room.
          </p>
        </div>


        <div className="guardian-header-actions">

          <Link
            to="/family/alerts"
            className="guardian-notification-button"
            aria-label="Respiratory alerts"
          >
            <Bell size={18} />
          </Link>


          <div className="guardian-header-profile">

            <div className="guardian-header-avatar">
              <UsersRound size={18} />
            </div>

            <div>
              <strong>
                {user?.name || "Guardian"}
              </strong>

              <span>
                Family Guardian
              </span>
            </div>

          </div>

        </div>

      </header>


      {error && (
        <div className="guardian-error">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}


      {loadingPatients ? (

        <GuardianLoading />

      ) : patients.length === 0 ? (

        <NoPatients />

      ) : (

        <>

          {/* =============================================
              PATIENT SWITCHER
          ============================================= */}

          <section className="guardian-patient-switcher">

            <div className="guardian-switcher-title">

              <div>
                <span>
                  MY PATIENTS
                </span>

                <h2>
                  People in your care
                </h2>
              </div>


              <Link
                to="/family/connections"
                className="guardian-add-patient"
              >
                <Link2 size={16} />
                Connect patient
              </Link>

            </div>


            <div className="guardian-patient-scroll">

              {patients.map((patient) => {
                const patientId =
                  getPatientId(patient);

                const patientName =
                  getPatientName(patient);

                const selected =
                  patientId ===
                  selectedPatientId;

                return (
                  <button
                    key={patientId}
                    type="button"
                    className={
                      selected
                        ? "guardian-patient-option selected"
                        : "guardian-patient-option"
                    }
                    onClick={() =>
                      setSelectedPatientId(
                        patientId
                      )
                    }
                  >

                    <div className="guardian-patient-photo">
                      <UserRound size={21} />
                    </div>


                    <div className="guardian-patient-option-info">

                      <strong>
                        {patientName}
                      </strong>

                      <span>
                        {selected
                          ? "Currently viewing"
                          : "Connected patient"}
                      </span>

                    </div>


                    <div
                      className={
                        selected
                          ? "guardian-patient-select-dot selected"
                          : "guardian-patient-select-dot"
                      }
                    />

                  </button>
                );
              })}

            </div>

          </section>


          {/* =============================================
              STATUS HERO
          ============================================= */}

          <section
            className={
              `guardian-health-hero ${status.className}`
            }
          >

            <div className="guardian-hero-glow" />


            <div className="guardian-hero-main">

              <div className="guardian-lung-scene">

                <div className="guardian-lung-ring ring-a" />
                <div className="guardian-lung-ring ring-b" />
                <div className="guardian-lung-ring ring-c" />


                <div className="guardian-lung-core">
                  <LungGraphic />
                </div>


                {hasSignal && (
                  <div className="guardian-live-orbit">
                    <Radio size={13} />
                    LIVE
                  </div>
                )}

              </div>


              <div className="guardian-hero-copy">

                <div className="guardian-current-patient">

                  <span className="guardian-avatar-small">
                    <UserRound size={15} />
                  </span>

                  <span>
                    {selectedPatientName}
                  </span>

                </div>


                <span className="guardian-hero-label">
                  CURRENT RESPIRATORY STATE
                </span>


                <h2>
                  {status.headline(
                    firstName(
                      selectedPatientName
                    )
                  )}
                </h2>


                <p>
                  {status.description}
                </p>


                <div className="guardian-status-row">

                  <span
                    className={
                      `guardian-state-chip ${status.className}`
                    }
                  >
                    <HeartPulse size={15} />
                    {status.label}
                  </span>


                  <span className="guardian-source-chip">

                    {hasSignal ? (
                      <Signal size={15} />
                    ) : (
                      <WifiOff size={15} />
                    )}

                    {hasSignal
                      ? mode === "DEMO"
                        ? "Simulation"
                        : "Live monitoring"
                      : "Waiting for signal"}

                  </span>

                </div>

              </div>

            </div>


            {/* VITALS */}

            <div className="guardian-vitals-panel">

              <GuardianVital
                icon={<Activity size={18} />}
                label="Breathing Rate"
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


              <GuardianVital
                icon={<HeartPulse size={18} />}
                label="Demo Reference"
                value={
                  baseline ?? "--"
                }
                suffix={
                  baseline !== null
                    ? "BPM"
                    : ""
                }
              />


              <GuardianVital
                icon={<Activity size={18} />}
                label="Deviation"
                value={
                  deviation === null
                    ? "--"
                    : deviation > 0
                      ? `+${deviation}`
                      : deviation
                }
                suffix={
                  deviation !== null
                    ? "BPM"
                    : ""
                }
              />


              <GuardianVital
                icon={<Signal size={18} />}
                label="Signal"
                value={
                  hasSignal
                    ? quality
                    : "--"
                }
              />

            </div>

          </section>


          {/* =============================================
              WAVEFORM
          ============================================= */}

          <section className="guardian-wave-card">

            <div className="guardian-card-header">

              <div className="guardian-card-title">

                <div className="guardian-card-icon">
                  <Activity size={20} />
                </div>


                <div>
                  <span>
                    LIVE MONITORING
                  </span>

                  <h2>
                    Respiratory Waveform
                  </h2>

                  <p>
                    Respiratory motion currently
                    received for{" "}
                    {selectedPatientName}.
                  </p>
                </div>

              </div>


              <div className="guardian-wave-rate">

                <span
                  className={
                    hasSignal
                      ? "guardian-live-dot active"
                      : "guardian-live-dot"
                  }
                />

                <div>
                  <strong>
                    {rate !== null
                      ? formatNumber(rate)
                      : "--"}
                  </strong>

                  <span>
                    BPM
                  </span>
                </div>

              </div>

            </div>


            <div className="guardian-wave-area">

              <RespiratoryWaveform
                respiratoryRate={
                  hasSignal ? rate : null
                }
                amplitude={
                  hasSignal ? amplitude : 0
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
                active={hasSignal}
              />

            </div>


            <div className="guardian-wave-footer">

              <div>
                <Signal size={15} />

                <span>
                  Signal quality
                </span>

                <strong>
                  {hasSignal
                    ? quality
                    : "No signal"}
                </strong>
              </div>


              <div>
                <Radio size={15} />

                <span>
                  Source
                </span>

                <strong>
                  {hasSignal
                    ? mode === "DEMO"
                      ? "Simulation"
                      : "ESP32 CSI"
                    : "--"}
                </strong>
              </div>


              <div>
                <HeartPulse size={15} />

                <span>
                  Pattern
                </span>

                <strong>
                  {hasSignal
                    ? prettyPattern(pattern)
                    : "--"}
                </strong>
              </div>

            </div>

          </section>


          {/* =============================================
              CARE GRID
          ============================================= */}

          <div className="guardian-care-grid">

            {/* MEDICATION */}

            <section className="guardian-panel">

              <div className="guardian-panel-header">

                <div className="guardian-card-title">

                  <div className="guardian-card-icon medication">
                    <Pill size={19} />
                  </div>


                  <div>
                    <span>
                      TODAY'S CARE
                    </span>

                    <h2>
                      Medication
                    </h2>
                  </div>

                </div>


                <Link
                  to="/family/medications"
                  className="guardian-text-link"
                >
                  View all
                  <ArrowRight size={15} />
                </Link>

              </div>


              {medications.length > 0 && (

                <div className="guardian-adherence">

                  <div className="guardian-adherence-top">

                    <div>
                      <strong>
                        {medicationPercent}%
                      </strong>

                      <span>
                        completed today
                      </span>
                    </div>


                    <div>
                      {takenCount} of{" "}
                      {medications.length}
                    </div>

                  </div>


                  <div className="guardian-progress-track">

                    <div
                      style={{
                        width:
                          `${medicationPercent}%`,
                      }}
                    />

                  </div>

                </div>

              )}


              {medications.length === 0 ? (

                <div className="guardian-empty-small">

                  <div>
                    <Pill size={22} />
                  </div>

                  <strong>
                    No medication scheduled
                  </strong>

                  <span>
                    Prescriptions from the
                    patient's doctor will appear
                    here.
                  </span>

                </div>

              ) : (

                <div className="guardian-medication-list">

                  {medications
                    .slice(0, 4)
                    .map((medication) => (

                      <MedicationRow
                        key={medication.id}
                        medication={medication}
                        updating={
                          updatingMedication ===
                          medication.id
                        }
                        onToggle={() =>
                          toggleMedication(
                            medication
                          )
                        }
                      />

                    ))}

                </div>

              )}

            </section>


            {/* CARE SNAPSHOT */}

            <section className="guardian-panel">

              <div className="guardian-panel-header">

                <div className="guardian-card-title">

                  <div className="guardian-card-icon care">
                    <HeartHandshake size={19} />
                  </div>


                  <div>
                    <span>
                      CARE SNAPSHOT
                    </span>

                    <h2>
                      At a glance
                    </h2>
                  </div>

                </div>

              </div>


              <div className="guardian-snapshot-grid">

                <SnapshotItem
                  icon={<HeartPulse size={17} />}
                  label="Respiratory state"
                  value={status.label}
                  active={hasSignal}
                />


                <SnapshotItem
                  icon={<Signal size={17} />}
                  label="Monitoring"
                  value={
                    hasSignal
                      ? "Active"
                      : "Offline"
                  }
                  active={hasSignal}
                />


                <SnapshotItem
                  icon={<Pill size={17} />}
                  label="Medication"
                  value={
                    medications.length
                      ? `${takenCount}/${medications.length} taken`
                      : "None scheduled"
                  }
                  active={
                    medications.length > 0 &&
                    takenCount ===
                      medications.length
                  }
                />


                <SnapshotItem
                  icon={<ShieldCheck size={17} />}
                  label="Care connection"
                  value="Connected"
                  active
                />

              </div>


              <div className="guardian-care-note">

                <ShieldCheck size={19} />

                <div>
                  <strong>
                    Family access
                  </strong>

                  <p>
                    You can monitor respiratory
                    status and help record
                    medication adherence.
                    Prescriptions remain under
                    the doctor's control.
                  </p>
                </div>

              </div>

            </section>

          </div>

        </>
      )}

    </div>
  );
}


/* =====================================================
   NO PATIENTS
===================================================== */

function NoPatients() {
  return (
    <section className="guardian-first-connect">

      <div className="guardian-connect-art">

        <div className="guardian-connect-glow" />

        <div className="guardian-connect-lungs">
          <LungGraphic />
        </div>

      </div>


      <div className="guardian-connect-form-side">

        <span className="guardian-eyebrow">
          GET STARTED
        </span>

        <h2>
          Connect your first patient
        </h2>

        <p>
          Ask the patient to generate a temporary
          pairing code from their RespiCare Care
          Team page. Use that code to securely
          connect your Family account.
        </p>


        <Link
          to="/family/connections"
          className="guardian-connect-submit"
          style={{
            textDecoration: "none",
            marginTop: "24px",
          }}
        >
          <Link2 size={18} />
          Connect Patient
          <ArrowRight size={17} />
        </Link>

      </div>

    </section>
  );
}


/* =====================================================
   VITAL
===================================================== */

function GuardianVital({
  icon,
  label,
  value,
  suffix,
}) {
  return (
    <div className="guardian-vital">

      <div className="guardian-vital-icon">
        {icon}
      </div>

      <span>
        {label}
      </span>

      <strong>
        {value}

        {suffix && (
          <small>
            {suffix}
          </small>
        )}
      </strong>

    </div>
  );
}


/* =====================================================
   MEDICATION ROW
===================================================== */

function MedicationRow({
  medication,
  updating,
  onToggle,
}) {
  const taken =
    Boolean(medication.today?.taken);

  return (
    <div
      className={
        taken
          ? "guardian-medication-row taken"
          : "guardian-medication-row"
      }
    >

      <button
        type="button"
        className={
          taken
            ? "guardian-med-check checked"
            : "guardian-med-check"
        }
        onClick={onToggle}
        disabled={updating}
      >

        {updating ? (
          <Loader2
            size={15}
            className="spin-icon"
          />
        ) : taken ? (
          <CheckCircle2 size={17} />
        ) : (
          <span />
        )}

      </button>


      <div className="guardian-med-info">

        <strong>
          {medication.medicine_name}
        </strong>

        <span>
          {medication.dosage}
          {" • "}
          {medication.schedule}
        </span>

        {taken && (
          <small>
            Marked as taken today
          </small>
        )}

      </div>


      <div
        className={
          taken
            ? "guardian-med-state taken"
            : "guardian-med-state"
        }
      >
        {taken ? "Taken" : "Pending"}
      </div>

    </div>
  );
}


/* =====================================================
   SNAPSHOT
===================================================== */

function SnapshotItem({
  icon,
  label,
  value,
  active,
}) {
  return (
    <div className="guardian-snapshot-item">

      <div
        className={
          active
            ? "guardian-snapshot-icon active"
            : "guardian-snapshot-icon"
        }
      >
        {icon}
      </div>


      <div>
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>
      </div>

    </div>
  );
}


/* =====================================================
   LOADING
===================================================== */

function GuardianLoading() {
  return (
    <div className="guardian-loading">

      <div>
        <HeartPulse size={28} />
      </div>

      <Loader2
        size={20}
        className="spin-icon"
      />

      <span>
        Loading your care network...
      </span>

    </div>
  );
}


/* =====================================================
   LUNG GRAPHIC
===================================================== */

function LungGraphic() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="guardian-lung-svg"
      aria-hidden="true"
    >

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
        opacity="0.9"
      />

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
        opacity="0.9"
      />

      <path
        d="M60 17 L60 64"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />

      <path
        d="M60 47 L44 63"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />

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
      label: "No Live Signal",
      className: "offline",

      headline: (name) =>
        `Waiting for ${name}'s signal`,

      description:
        "No valid respiratory signal is currently available. RespiCare will keep the waveform flat until monitoring data is received.",
    };
  }


  if (pattern === "MOTION_ARTIFACT") {
    return {
      label: "Motion Detected",
      className: "watch",

      headline: (name) =>
        `${name} is moving`,

      description:
        "Movement is affecting respiratory signal quality, so the current pattern should be interpreted cautiously.",
    };
  }


  if (quality === "POOR") {
    return {
      label: "Signal Check",
      className: "watch",

      headline: () =>
        "Respiratory signal needs attention",

      description:
        "Signal quality is currently reduced. RespiCare is continuing to monitor for a reliable respiratory pattern.",
    };
  }


  if (pattern === "NORMAL") {
    return {
      label: "Normal",
      className: "normal",

      headline: (name) =>
        `${name} is breathing normally`,

      description:
        "The current respiratory pattern is close to the monitored reference.",
    };
  }


  if (pattern === "RECOVERY") {
    return {
      label: "Recovering",
      className: "recovery",

      headline: (name) =>
        `${name}'s breathing is recovering`,

      description:
        "The respiratory pattern is moving back toward the monitored reference.",
    };
  }


  if (
    pattern === "FAST" ||
    pattern === "FAST_BREATHING" ||
    pattern === "RAPID_BREATHING"
  ) {
    return {
      label: "Fast Pattern",
      className: "watch",

      headline: () =>
        "Breathing rate is above reference",

      description:
        "The current breathing rate is higher than the monitored reference. RespiCare is continuing to observe the pattern.",
    };
  }


  if (
    pattern === "SLOW" ||
    pattern === "SLOW_BREATHING"
  ) {
    return {
      label: "Slow Pattern",
      className: "watch",

      headline: () =>
        "Breathing rate is below reference",

      description:
        "The current breathing rate is lower than the monitored reference. RespiCare is continuing to observe the pattern.",
    };
  }


  if (
    pattern === "SHALLOW" ||
    pattern === "SHALLOW_BREATHING"
  ) {
    return {
      label: "Shallow Pattern",
      className: "watch",

      headline: () =>
        "Respiratory waveform has changed",

      description:
        "The respiratory waveform currently has lower simulated amplitude and is being monitored for persistence.",
    };
  }


  if (
    pattern === "BREATHING_PAUSE" ||
    pattern === "RESPIRATORY_DISTURBANCE"
  ) {
    return {
      label: "Pattern Change",
      className: "warning",

      headline: () =>
        "A respiratory-pattern change is being observed",

      description:
        "The current respiratory signal differs from the monitored reference. Persistence-based detection will determine whether escalation is needed.",
    };
  }


  return {
    label: "Pattern Change",
    className: "watch",

    headline: () =>
      "A breathing-pattern change is being monitored",

    description:
      "RespiCare is observing a change in the current respiratory pattern.",
  };
}


/* =====================================================
   HELPERS
===================================================== */

function firstName(name) {
  if (!name) {
    return "there";
  }

  return name
    .trim()
    .split(/\s+/)[0];
}


function prettyPattern(value) {
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
  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return Number.isInteger(number)
    ? number
    : number.toFixed(1);
}


function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}