import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Pill,
  Radio,
  ShieldCheck,
  Signal,
  UserRound,
  WifiOff,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import api from "../../services/api";

import RespiratoryWaveform from "../../components/RespiratoryWaveform";


export default function FamilyPatientView() {
  const { patientId } = useParams();

  const [patient, setPatient] =
    useState(null);

  const [monitoring, setMonitoring] =
    useState(null);

  const [medications, setMedications] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [updatingMedication, setUpdatingMedication] =
    useState(null);


  /* =====================================================
     PATIENT
  ===================================================== */

  const fetchPatient = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-patients"
      );

      const patients =
        Array.isArray(response.data)
          ? response.data
          : [];


      const match =
        patients.find((item) => {
          const id =
            item?.patient_id ??
            item?.id ??
            item?.patient?.id;

          return (
            String(id) ===
            String(patientId)
          );
        });


      if (!match) {
        setPatient(null);

        setError(
          "This patient is not connected to your Family account."
        );

        return;
      }


      setPatient(match);
      setError("");
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load patient."
      );
    }
  }, [patientId]);


  /* =====================================================
     MONITORING
  ===================================================== */

  const fetchMonitoring =
    useCallback(async () => {
      try {
        const response = await api.get(
          `/monitoring/patient/${patientId}/current`
        );

        setMonitoring(response.data);
      } catch (err) {
        console.error(err);
        setMonitoring(null);
      }
    }, [patientId]);


  /* =====================================================
     MEDICATIONS
  ===================================================== */

  const fetchMedications =
    useCallback(async () => {
      try {
        const response = await api.get(
          `/medications/patient/${patientId}`
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
    }, [patientId]);


  /* =====================================================
     LOAD PAGE
  ===================================================== */

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      await Promise.all([
        fetchPatient(),
        fetchMonitoring(),
        fetchMedications(),
      ]);

      setLoading(false);
    };

    load();
  }, [
    fetchPatient,
    fetchMonitoring,
    fetchMedications,
  ]);


  /* =====================================================
     LIVE POLLING
  ===================================================== */

  useEffect(() => {
    const monitoringTimer =
      setInterval(
        fetchMonitoring,
        500
      );

    const medicationTimer =
      setInterval(
        fetchMedications,
        15000
      );

    return () => {
      clearInterval(
        monitoringTimer
      );

      clearInterval(
        medicationTimer
      );
    };
  }, [
    fetchMonitoring,
    fetchMedications,
  ]);


  /* =====================================================
     MEDICATION UPDATE
  ===================================================== */

  const toggleMedication =
    async (medication) => {
      try {
        setUpdatingMedication(
          medication.id
        );

        await api.post(
          "/medications/taken",
          {
            prescription_id:
              medication.id,

            taken:
              !medication.today?.taken,
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
     VALUES
  ===================================================== */

  const patientName =
    patient?.patient_name ??
    patient?.name ??
    patient?.patient?.name ??
    "Patient";


  const rate =
    monitoring?.respiratory_rate ??
    null;


  const quality =
    monitoring?.signal_quality ||
    "UNKNOWN";


  const pattern =
    monitoring?.pattern ||
    "NO_DATA";


  const mode =
    monitoring?.mode ||
    "LIVE";


  const hasSignal =
    monitoring?.status ===
      "MONITORING" &&
    rate !== null &&
    quality !== "UNKNOWN" &&
    quality !== "UNRELIABLE";


  const amplitude =
    hasSignal
      ? monitoring?.simulated_volume !=
        null
        ? clamp(
            monitoring.simulated_volume /
              587,
            0.15,
            1.2
          )
        : 1
      : 0;


  const takenCount =
    medications.filter(
      (item) =>
        item.today?.taken
    ).length;


  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="guardian-dashboard">

        <div className="guardian-loading">

          <Loader2
            size={24}
            className="spin-icon"
          />

          <span>
            Loading patient profile...
          </span>

        </div>

      </div>
    );
  }


  /* =====================================================
     INVALID PATIENT
  ===================================================== */

  if (!patient) {
    return (
      <div className="guardian-dashboard">

        <Link
          to="/family/connections"
          className="guardian-open-patient"
        >
          <ArrowLeft size={17} />
          My Patients
        </Link>


        <section
          className="guardian-panel"
          style={{
            marginTop: "20px",
            padding: "30px",
          }}
        >

          <h2>
            Patient unavailable
          </h2>

          <p>
            {error ||
              "This patient could not be loaded."}
          </p>

        </section>

      </div>
    );
  }


  return (
    <div className="guardian-dashboard">

      {/* ===============================================
          BACK
      =============================================== */}

      <Link
        to="/family/connections"
        className="guardian-open-patient"
      >
        <ArrowLeft size={17} />
        My Patients
      </Link>


      {/* ===============================================
          PATIENT HEADER
      =============================================== */}

      <section
        className="guardian-panel"
        style={{
          marginTop: "18px",
          marginBottom: "20px",
          padding: "25px",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >

          <div
            style={{
              width: "62px",
              height: "62px",
              borderRadius: "18px",
              display: "grid",
              placeItems: "center",
              background: "#e7f5ef",
              color: "#288365",
            }}
          >
            <UserRound size={30} />
          </div>


          <div>

            <span className="guardian-eyebrow">
              PATIENT PROFILE
            </span>

            <h1
              style={{
                margin: "4px 0",
              }}
            >
              {patientName}
            </h1>

            <p
              style={{
                margin: 0,
              }}
            >
              Connected to your Family
              care network
            </p>

          </div>

        </div>

      </section>


      {/* ===============================================
          RESPIRATORY HERO
      =============================================== */}

      <section
        className={
          hasSignal
            ? "guardian-health-hero normal"
            : "guardian-health-hero offline"
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

            <span className="guardian-hero-label">
              CURRENT RESPIRATORY STATUS
            </span>


            <h2>
              {hasSignal
                ? getStatusTitle(
                    patientName,
                    pattern
                  )
                : `Waiting for ${firstName(
                    patientName
                  )}'s signal`}
            </h2>


            <p>
              {hasSignal
                ? getStatusDescription(
                    pattern
                  )
                : "No valid respiratory signal is currently available. RespiCare will keep the waveform flat until monitoring data is received."}
            </p>


            <div className="guardian-status-row">

              <span
                className={
                  hasSignal
                    ? "guardian-state-chip normal"
                    : "guardian-state-chip offline"
                }
              >

                {hasSignal ? (
                  <HeartPulse size={15} />
                ) : (
                  <WifiOff size={15} />
                )}

                {hasSignal
                  ? prettyPattern(pattern)
                  : "No Live Signal"}

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
                    : "Live Monitoring"
                  : "Waiting for signal"}

              </span>

            </div>

          </div>

        </div>


        {/* VITALS */}

        <div className="guardian-vitals-panel">

          <Vital
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


          <Vital
            icon={<Signal size={18} />}
            label="Signal Quality"
            value={
              hasSignal
                ? quality
                : "--"
            }
          />


          <Vital
            icon={<Radio size={18} />}
            label="Source"
            value={
              hasSignal
                ? mode === "DEMO"
                  ? "Simulation"
                  : "ESP32"
                : "--"
            }
          />


          <Vital
            icon={<Pill size={18} />}
            label="Medication"
            value={
              medications.length
                ? `${takenCount}/${medications.length}`
                : "--"
            }
            suffix={
              medications.length
                ? "TAKEN"
                : ""
            }
          />

        </div>

      </section>


      {/* ===============================================
          WAVEFORM
      =============================================== */}

      <section
        className="guardian-wave-card"
        style={{
          marginTop: "20px",
        }}
      >

        <div className="guardian-card-header">

          <div className="guardian-card-title">

            <div className="guardian-card-icon">
              <Activity size={20} />
            </div>

            <div>
              <span>
                RESPIRATORY MONITORING
              </span>

              <h2>
                Live Respiratory Waveform
              </h2>

              <p>
                Current respiratory motion
                received for {patientName}.
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
            active={hasSignal}
          />

        </div>


        <div className="guardian-wave-footer">

          <div>
            <Signal size={15} />

            <span>
              Signal
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


      {/* ===============================================
          MEDICATION
      =============================================== */}

      <section
        className="guardian-panel"
        style={{
          marginTop: "20px",
        }}
      >

        <div className="guardian-panel-header">

          <div className="guardian-card-title">

            <div className="guardian-card-icon medication">
              <Pill size={20} />
            </div>

            <div>
              <span>
                MEDICATION CARE
              </span>

              <h2>
                Today's Medication
              </h2>

              <p>
                Family members can help record
                medication adherence for the
                patient.
              </p>
            </div>

          </div>


          {medications.length > 0 && (
            <strong>
              {takenCount} /{" "}
              {medications.length} taken
            </strong>
          )}

        </div>


        {medications.length === 0 ? (

          <div
            className="guardian-empty-small"
            style={{
              padding: "30px 22px",
            }}
          >

            <Pill size={25} />

            <strong>
              No active prescriptions
            </strong>

            <span>
              Prescriptions created by the
              patient's doctor will appear here.
            </span>

          </div>

        ) : (

          <div
            className="guardian-medication-list"
            style={{
              padding: "0 22px 24px",
            }}
          >

            {medications.map(
              (medication) => {
                const taken =
                  Boolean(
                    medication.today?.taken
                  );

                const updating =
                  updatingMedication ===
                  medication.id;

                return (
                  <div
                    key={medication.id}
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
                      disabled={updating}
                      onClick={() =>
                        toggleMedication(
                          medication
                        )
                      }
                    >

                      {updating ? (
                        <Loader2
                          size={16}
                          className="spin-icon"
                        />
                      ) : taken ? (
                        <CheckCircle2
                          size={17}
                        />
                      ) : (
                        <span />
                      )}

                    </button>


                    <div className="guardian-med-info">

                      <strong>
                        {
                          medication.medicine_name
                        }
                      </strong>

                      <span>
                        {medication.dosage}
                        {" • "}
                        {medication.schedule}
                      </span>


                      {medication.doctor_name && (
                        <small>
                          Prescribed by{" "}
                          {
                            medication.doctor_name
                          }
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
                      {taken
                        ? "Taken"
                        : "Pending"}
                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </section>


      {/* ===============================================
          ACCESS INFO
      =============================================== */}

      <div
        className="guardian-care-note"
        style={{
          marginTop: "18px",
        }}
      >

        <ShieldCheck size={20} />

        <div>
          <strong>
            Family caregiver access
          </strong>

          <p>
            You can view respiratory monitoring
            and prescriptions and help record
            medication adherence. Prescription
            management remains under the
            patient's doctor.
          </p>
        </div>

      </div>

    </div>
  );
}


/* =====================================================
   VITAL
===================================================== */

function Vital({
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
   LUNGS
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
   STATUS
===================================================== */

function getStatusTitle(
  patientName,
  pattern
) {
  const name =
    firstName(patientName);

  if (pattern === "NORMAL") {
    return `${name} is breathing normally`;
  }

  if (pattern === "RECOVERY") {
    return `${name}'s breathing is recovering`;
  }

  if (
    pattern === "FAST" ||
    pattern === "FAST_BREATHING"
  ) {
    return "Breathing rate is above reference";
  }

  if (
    pattern === "SLOW" ||
    pattern === "SLOW_BREATHING"
  ) {
    return "Breathing rate is below reference";
  }

  if (
    pattern === "SHALLOW" ||
    pattern === "SHALLOW_BREATHING"
  ) {
    return "Respiratory waveform has changed";
  }

  if (
    pattern === "BREATHING_PAUSE"
  ) {
    return "Respiratory-pattern change detected";
  }

  if (
    pattern === "MOTION_ARTIFACT"
  ) {
    return `${name} is moving`;
  }

  return "Respiratory monitoring active";
}


function getStatusDescription(pattern) {
  if (pattern === "NORMAL") {
    return "The current respiratory pattern is close to the monitored reference.";
  }

  if (pattern === "RECOVERY") {
    return "The respiratory pattern is moving back toward the monitored reference.";
  }

  if (pattern === "MOTION_ARTIFACT") {
    return "Movement is currently affecting respiratory signal quality.";
  }

  return "RespiCare is observing the current respiratory pattern and signal quality.";
}


/* =====================================================
   HELPERS
===================================================== */

function firstName(name) {
  if (!name) {
    return "Patient";
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
  const number =
    Number(value);

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
    Math.max(
      value,
      minimum
    ),
    maximum
  );
}