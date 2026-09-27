import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  HeartPulse,
  Pill,
  Plus,
  Radio,
  ShieldCheck,
  Signal,
  Stethoscope,
  Trash2,
  WifiOff,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../../services/api";

import RespiratoryWaveform from "../../components/RespiratoryWaveform";


const getPatientId = (patient) =>
  patient?.patient_id ??
  patient?.id ??
  patient?.patient?.id ??
  null;


const getPatientName = (patient) =>
  patient?.patient_name ??
  patient?.name ??
  patient?.patient?.name ??
  "Patient";


const getPatientEmail = (patient) =>
  patient?.patient_email ??
  patient?.email ??
  patient?.patient?.email ??
  "";


function reliable(monitoring) {
  const quality = String(
    monitoring?.signal_quality || "UNKNOWN"
  ).toUpperCase();

  return (
    monitoring?.status === "MONITORING" &&
    monitoring?.respiratory_rate != null &&
    ![
      "UNKNOWN",
      "UNRELIABLE",
      "SIGNAL_LOSS",
      "LOST",
      "POOR",
      "MOTION_ARTIFACT",
    ].includes(quality)
  );
}


function stateClass(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", "-");
}


function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}


export default function DoctorPatientView() {
  const { patientId } = useParams();

  const navigate = useNavigate();


  const [patient, setPatient] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [medications, setMedications] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    medicine_name: "",
    dosage: "",
    schedule: "",
    instructions: "",
  });


  const loadPatient = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-patients"
      );

      const list = Array.isArray(response.data)
        ? response.data
        : [];

      const found = list.find(
        (item) =>
          String(getPatientId(item)) ===
          String(patientId)
      );

      if (!found) {
        navigate("/doctor/patients");
        return;
      }

      setPatient(found);
    } catch (error) {
      console.error(error);
    }
  }, [patientId, navigate]);


  const loadMonitoring = useCallback(async () => {
    try {
      const response = await api.get(
        `/monitoring/patient/${patientId}/current`
      );

      setMonitoring(response.data);
    } catch (error) {
      console.error(error);
    }
  }, [patientId]);


  const loadClinicalData = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get(
        `/medications/patient/${patientId}`
      ),

      api.get(
        `/alerts/patient/${patientId}`
      ),
    ]);


    if (results[0].status === "fulfilled") {
      setMedications(
        Array.isArray(results[0].value.data)
          ? results[0].value.data
          : []
      );
    }


    if (results[1].status === "fulfilled") {
      setAlerts(
        Array.isArray(results[1].value.data)
          ? results[1].value.data
          : []
      );
    }
  }, [patientId]);


  useEffect(() => {
    const initial = async () => {
      setLoading(true);

      await Promise.all([
        loadPatient(),
        loadMonitoring(),
        loadClinicalData(),
      ]);

      setLoading(false);
    };

    initial();


    const monitorTimer = setInterval(
      loadMonitoring,
      500
    );

    const clinicalTimer = setInterval(
      loadClinicalData,
      5000
    );


    return () => {
      clearInterval(monitorTimer);
      clearInterval(clinicalTimer);
    };
  }, [
    loadPatient,
    loadMonitoring,
    loadClinicalData,
  ]);


  const createPrescription = async (event) => {
    event.preventDefault();

    if (
      !form.medicine_name.trim() ||
      !form.dosage.trim() ||
      !form.schedule.trim()
    ) {
      return;
    }


    try {
      setSaving(true);

      await api.post(
        "/medications/prescriptions",
        {
          patient_id: Number(patientId),

          medicine_name:
            form.medicine_name.trim(),

          dosage:
            form.dosage.trim(),

          schedule:
            form.schedule.trim(),

          instructions:
            form.instructions.trim(),
        }
      );


      setForm({
        medicine_name: "",
        dosage: "",
        schedule: "",
        instructions: "",
      });


      await loadClinicalData();
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };


  const stopPrescription = async (prescriptionId) => {
    const confirmed = window.confirm(
      "Stop this prescription?"
    );

    if (!confirmed) return;


    try {
      await api.delete(
        `/medications/prescriptions/${prescriptionId}`
      );

      await loadClinicalData();
    } catch (error) {
      console.error(error);
    }
  };


  const acknowledgeAlert = async (alertId) => {
    try {
      await api.post(
        `/alerts/${alertId}/acknowledge`
      );

      await loadClinicalData();
    } catch (error) {
      console.error(error);
    }
  };


  const active = reliable(monitoring);

  const detectorState = String(
    monitoring?.detector_state ||
    (active ? "NORMAL" : "SIGNAL_UNRELIABLE")
  ).toUpperCase();


  const rate =
    monitoring?.respiratory_rate != null
      ? Number(monitoring.respiratory_rate)
      : null;


  const baseline =
    monitoring?.baseline_rate != null
      ? Number(monitoring.baseline_rate)
      : null;


  const deviation =
    rate != null &&
    baseline != null &&
    baseline > 0
      ? ((rate - baseline) / baseline) * 100
      : null;


  const amplitude =
    monitoring?.simulated_volume != null
      ? Math.max(
          0.15,
          Math.min(
            Number(
              monitoring.simulated_volume
            ) / 587,
            1.2
          )
        )
      : 1;


  const activePrescriptions = useMemo(
    () =>
      medications.filter(
        (medicine) =>
          medicine.is_active !== false
      ),
    [medications]
  );


  const latestAlert =
    alerts.find(
      (alert) => !alert.acknowledged
    ) || alerts[0];


  if (loading) {
    return (
      <div className="doctor-page-loading">
        <Activity className="doctor-spin" />
        Loading patient...
      </div>
    );
  }


  return (
    <div className="doctor-dashboard">

      <button
        type="button"
        className="doctor-back-button"
        onClick={() =>
          navigate("/doctor/patients")
        }
      >
        <ArrowLeft size={17} />
        Back to patients
      </button>


      <section className="doctor-patient-profile-header">

        <div className="doctor-profile-avatar">
          {getPatientName(patient)
            .charAt(0)
            .toUpperCase()}
        </div>


        <div className="doctor-profile-identity">
          <p className="doctor-eyebrow">
            CONNECTED PATIENT
          </p>

          <h1>
            {getPatientName(patient)}
          </h1>

          <span>
            {getPatientEmail(patient) ||
              "Patient connected to your clinical account"}
          </span>
        </div>


        <div className="doctor-clinical-access-pill">
          <ShieldCheck size={17} />
          Clinical access
        </div>

      </section>


      <section
        className={`doctor-monitoring-hero ${stateClass(
          detectorState
        )}`}
      >

        <div className="doctor-monitoring-hero-heading">

          <div>
            <p className="doctor-section-kicker">
              CURRENT RESPIRATORY STATUS
            </p>

            <h2>
              {detectorState === "NORMAL" &&
                "Stable Pattern"}

              {detectorState === "WATCH" &&
                "Pattern Being Observed"}

              {detectorState === "WARNING" &&
                "Persistent Pattern Change"}

              {detectorState === "DISTRESS" &&
                "Significant Persistent Change"}

              {detectorState ===
                "SIGNAL_UNRELIABLE" &&
                "Signal Unavailable"}
            </h2>

            <p>
              {monitoring?.detector_reason ||
                "Waiting for respiratory monitoring data."}
            </p>
          </div>


          <span
            className={`doctor-large-state ${stateClass(
              detectorState
            )}`}
          >
            {detectorState.replaceAll("_", " ")}
          </span>

        </div>


        <div className="doctor-vitals-grid">

          <div className="doctor-vital">
            <HeartPulse size={19} />

            <span>Current Rate</span>

            <strong>
              {rate != null
                ? Math.round(rate)
                : "--"}
            </strong>

            <small>BPM</small>
          </div>


          <div className="doctor-vital">
            <Activity size={19} />

            <span>Baseline</span>

            <strong>
              {baseline != null
                ? baseline.toFixed(1)
                : "--"}
            </strong>

            <small>BPM</small>
          </div>


          <div className="doctor-vital">
            <Stethoscope size={19} />

            <span>Deviation</span>

            <strong>
              {deviation != null
                ? `${deviation >= 0 ? "+" : ""}${Math.round(
                    deviation
                  )}%`
                : "--"}
            </strong>
          </div>


          <div className="doctor-vital">
            {active ? (
              <Signal size={19} />
            ) : (
              <WifiOff size={19} />
            )}

            <span>Signal</span>

            <strong className="doctor-vital-word">
              {monitoring?.signal_quality ||
                "UNKNOWN"}
            </strong>
          </div>


          <div className="doctor-vital">
            <Radio size={19} />

            <span>Source</span>

            <strong className="doctor-vital-word">
              {monitoring?.source ===
                "SIMULATION" ||
              monitoring?.mode === "DEMO"
                ? "SIMULATION"
                : "LIVE"}
            </strong>
          </div>

        </div>


        <div className="doctor-waveform-panel">

          <div className="doctor-waveform-heading">
            <div>
              <strong>
                Respiratory Waveform
              </strong>

              <span>
                {active
                  ? "Current respiratory motion"
                  : "Waiting for reliable signal"}
              </span>
            </div>

            <span className="doctor-waveform-rate">
              {rate != null
                ? `${Math.round(rate)} BPM`
                : "-- BPM"}
            </span>
          </div>


          <RespiratoryWaveform
            respiratoryRate={rate}
            amplitude={amplitude}
            signalQuality={
              monitoring?.signal_quality ||
              "UNKNOWN"
            }
            pattern={
              monitoring?.pattern ||
              "UNKNOWN"
            }
            active={active}
          />

        </div>

      </section>


      <div className="doctor-patient-two-column">

        <section className="doctor-panel">
          <div className="doctor-panel-header">
            <div>
              <p className="doctor-section-kicker">
                DETECTOR
              </p>

              <h2>Pattern Analysis</h2>
            </div>
          </div>


          <div className="doctor-detector-track">
            {[
              "NORMAL",
              "WATCH",
              "WARNING",
              "DISTRESS",
            ].map((state, index) => (
              <div
                key={state}
                className={`doctor-detector-step ${
                  state === detectorState
                    ? "current"
                    : ""
                }`}
              >
                <div className="doctor-detector-dot">
                  {index + 1}
                </div>

                <div>
                  <strong>{state}</strong>

                  <span>
                    {state === "NORMAL" &&
                      "Near learned baseline"}

                    {state === "WATCH" &&
                      "Persistent change being observed"}

                    {state === "WARNING" &&
                      "Sustained pattern change"}

                    {state === "DISTRESS" &&
                      "Stronger sustained change"}
                  </span>
                </div>
              </div>
            ))}
          </div>


          {detectorState ===
            "SIGNAL_UNRELIABLE" && (
            <div className="doctor-signal-note">
              <WifiOff size={18} />

              Signal quality is currently insufficient for
              respiratory-pattern interpretation.
            </div>
          )}
        </section>


        <section className="doctor-panel">
          <div className="doctor-panel-header">
            <div>
              <p className="doctor-section-kicker">
                LATEST EVENT
              </p>

              <h2>Respiratory Alert</h2>
            </div>
          </div>


          {!latestAlert ? (
            <div className="doctor-positive-empty">
              <CheckCircle2 size={22} />

              <div>
                <strong>No recorded alert</strong>

                <span>
                  Persistent respiratory events will
                  appear here.
                </span>
              </div>
            </div>
          ) : (
            <div className="doctor-profile-alert">

              <div className="doctor-profile-alert-icon">
                <BellRing size={21} />
              </div>


              <div>
                <div className="doctor-profile-alert-top">
                  <strong>
                    {latestAlert.severity}
                  </strong>

                  <span>
                    {formatTime(
                      latestAlert.created_at
                    )}
                  </span>
                </div>

                <p>
                  {latestAlert.message}
                </p>


                {!latestAlert.acknowledged ? (
                  <button
                    type="button"
                    className="doctor-primary-button"
                    onClick={() =>
                      acknowledgeAlert(
                        latestAlert.id
                      )
                    }
                  >
                    <CheckCircle2 size={16} />
                    Acknowledge
                  </button>
                ) : (
                  <span className="doctor-acknowledged-label">
                    <CheckCircle2 size={16} />
                    Acknowledged
                  </span>
                )}
              </div>

            </div>
          )}
        </section>

      </div>


      <section className="doctor-panel">

        <div className="doctor-panel-header">
          <div>
            <p className="doctor-section-kicker">
              TREATMENT
            </p>

            <h2>Prescription Plan</h2>

            <p>
              Create and manage medication instructions
              for this patient.
            </p>
          </div>
        </div>


        <form
          className="doctor-prescription-form"
          onSubmit={createPrescription}
        >

          <label className="doctor-field">
            <span>Medicine</span>

            <input
              value={form.medicine_name}
              onChange={(event) =>
                setForm({
                  ...form,
                  medicine_name:
                    event.target.value,
                })
              }
              placeholder="Medicine name"
            />
          </label>


          <label className="doctor-field">
            <span>Dosage</span>

            <input
              value={form.dosage}
              onChange={(event) =>
                setForm({
                  ...form,
                  dosage:
                    event.target.value,
                })
              }
              placeholder="e.g. 1 tablet"
            />
          </label>


          <label className="doctor-field">
            <span>Schedule</span>

            <input
              value={form.schedule}
              onChange={(event) =>
                setForm({
                  ...form,
                  schedule:
                    event.target.value,
                })
              }
              placeholder="e.g. Twice daily"
            />
          </label>


          <label className="doctor-field doctor-field-wide">
            <span>Instructions</span>

            <input
              value={form.instructions}
              onChange={(event) =>
                setForm({
                  ...form,
                  instructions:
                    event.target.value,
                })
              }
              placeholder="Optional instructions"
            />
          </label>


          <button
            type="submit"
            className="doctor-primary-button"
            disabled={saving}
          >
            <Plus size={17} />

            {saving
              ? "Creating..."
              : "Add Prescription"}
          </button>

        </form>


        {activePrescriptions.length === 0 ? (
          <div className="doctor-empty-state compact">
            <Pill size={25} />

            <h3>No active prescriptions</h3>
          </div>
        ) : (
          <div className="doctor-prescription-list">

            {activePrescriptions.map(
              (medicine) => (
                <div
                  key={medicine.id}
                  className="doctor-prescription-row"
                >

                  <div className="doctor-prescription-icon">
                    <Pill size={19} />
                  </div>


                  <div className="doctor-prescription-name">
                    <strong>
                      {medicine.medicine_name}
                    </strong>

                    <span>
                      {medicine.instructions ||
                        "No additional instructions"}
                    </span>
                  </div>


                  <div>
                    <span className="doctor-row-label">
                      Dosage
                    </span>

                    <strong>
                      {medicine.dosage}
                    </strong>
                  </div>


                  <div>
                    <span className="doctor-row-label">
                      Schedule
                    </span>

                    <strong>
                      {medicine.schedule}
                    </strong>
                  </div>


                  <div>
                    <span className="doctor-row-label">
                      Today
                    </span>

                    <strong>
                      {medicine.today?.taken
                        ? "Taken"
                        : "Pending"}
                    </strong>
                  </div>


                  <button
                    type="button"
                    className="doctor-danger-button"
                    onClick={() =>
                      stopPrescription(
                        medicine.id
                      )
                    }
                  >
                    <Trash2 size={16} />
                    Stop
                  </button>

                </div>
              )
            )}

          </div>
        )}

      </section>

    </div>
  );
}