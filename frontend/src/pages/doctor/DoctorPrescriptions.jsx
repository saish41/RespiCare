
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pill,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../../services/api";

// =========================================================
// HELPERS
// =========================================================

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

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;

  return new Date(now.getTime() - offset)
    .toISOString()
    .slice(0, 10);
}

function initialPrescriptionForm() {
  return {
    medicine_name: "",
    dosage: "",
    medicine_form: "Tablet",
    schedule: "",
    doses_per_day: 1,
    dose_times: [""],
    food_instruction: "",
    instructions: "",
    start_date: getLocalDate(),
    duration_days: "",
  };
}

function getApiError(error) {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc)
          ? item.loc.slice(1).join(".")
          : "";

        return `${field ? `${field}: ` : ""}${
          item.msg || "Invalid value"
        }`;
      })
      .join("; ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  return (
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function getTodayStatus(medication) {
  if (
    medication.is_active === false ||
    String(
      medication.status || "ACTIVE"
    ).toUpperCase() !== "ACTIVE"
  ) {
    return "Stopped";
  }

  const doses = medication?.today?.doses;

  if (
    !Array.isArray(doses) ||
    doses.length === 0
  ) {
    return "Not scheduled";
  }

  const statuses = doses.map((dose) =>
    String(dose.status || "PENDING").toUpperCase()
  );

  if (
    statuses.every((status) => status === "TAKEN")
  ) {
    return "Taken";
  }

  if (
    statuses.every(
      (status) => status === "NOT_TAKEN"
    )
  ) {
    return "Not Taken";
  }

  if (statuses.includes("TAKEN")) {
    return "Partially Taken";
  }

  return "Pending";
}

// =========================================================
// DOCTOR PRESCRIPTIONS
// =========================================================

export default function DoctorPrescriptions() {
  const [patients, setPatients] = useState([]);

  const [
    selectedPatientId,
    setSelectedPatientId,
  ] = useState("");

  const [medications, setMedications] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(
    initialPrescriptionForm
  );

  // =======================================================
  // UPDATE FORM
  // =======================================================

  const updateForm = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // =======================================================
  // LOAD CONNECTED PATIENTS
  // =======================================================

  const loadPatients = useCallback(async () => {
    try {
      setLoading(true);

      const response = await api.get(
        "/connections/my-patients"
      );

      const list = Array.isArray(response.data)
        ? response.data
        : [];

      setPatients(list);

      setSelectedPatientId((previous) => {
        const existing = list.some(
          (patient) =>
            String(getPatientId(patient)) ===
            String(previous)
        );

        if (existing) {
          return previous;
        }

        return list.length > 0
          ? String(getPatientId(list[0]))
          : "";
      });
    } catch (err) {
      console.error(
        "Failed to load patients:",
        err
      );

      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // =======================================================
  // LOAD PRESCRIPTIONS
  // =======================================================

  const loadMedications = useCallback(async () => {
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
      console.error(
        "Failed to load medications:",
        err
      );

      setError(getApiError(err));
    }
  }, [selectedPatientId]);

  // =======================================================
  // INITIAL LOAD
  // =======================================================

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    loadMedications();
  }, [loadMedications]);

  // =======================================================
  // CHANGE DOSES PER DAY
  // =======================================================

  const changeDosesPerDay = (value) => {
    const count = Number(value);

    setForm((previous) => ({
      ...previous,

      doses_per_day: count,

      dose_times: Array.from(
        { length: count },
        (_, index) =>
          previous.dose_times[index] || ""
      ),
    }));
  };

  // =======================================================
  // CHANGE DOSE TIME
  // =======================================================

  const changeDoseTime = (index, value) => {
    setForm((previous) => ({
      ...previous,

      dose_times: previous.dose_times.map(
        (existing, i) =>
          i === index ? value : existing
      ),
    }));
  };

  // =======================================================
  // CREATE PRESCRIPTION - FIXED 422
  // =======================================================

  const createPrescription = async (event) => {
    event.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    const patientId = Number(selectedPatientId);

    const dosesPerDay = Number(
      form.doses_per_day
    );

    const doseTimes = form.dose_times.map(
      (value) => String(value).trim()
    );

    const durationDays =
      form.duration_days === ""
        ? null
        : Number(form.duration_days);

    // -----------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------

    if (
      !Number.isInteger(patientId) ||
      patientId <= 0
    ) {
      setError("Please select a valid patient.");
      return;
    }

    if (
      !form.medicine_name.trim() ||
      !form.dosage.trim()
    ) {
      setError(
        "Medicine name and dosage are required."
      );
      return;
    }

    if (
      !Number.isInteger(dosesPerDay) ||
      dosesPerDay < 1 ||
      dosesPerDay > 4
    ) {
      setError(
        "Doses per day must be between 1 and 4."
      );
      return;
    }

    if (
      doseTimes.length !== dosesPerDay ||
      doseTimes.some(
        (value) =>
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      )
    ) {
      setError(
        "Please select a valid time for every dose."
      );
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        form.start_date
      )
    ) {
      setError(
        "Please select a valid start date."
      );
      return;
    }

    if (
      durationDays !== null &&
      (
        !Number.isInteger(durationDays) ||
        durationDays < 1
      )
    ) {
      setError(
        "Duration must be at least 1 day, or left blank."
      );
      return;
    }

    // -----------------------------------------------------
    // COMPLETE FASTAPI REQUEST PAYLOAD
    // -----------------------------------------------------

    const payload = {
      patient_id: patientId,

      medicine_name:
        form.medicine_name.trim(),

      dosage:
        form.dosage.trim(),

      medicine_form:
        form.medicine_form.trim() || "Tablet",

      schedule:
        form.schedule.trim() ||
        `${dosesPerDay} dose(s) daily`,

      doses_per_day:
        dosesPerDay,

      dose_times:
        doseTimes,

      food_instruction:
        form.food_instruction.trim(),

      instructions:
        form.instructions.trim(),

      start_date:
        form.start_date,

      duration_days:
        durationDays,
    };

    // -----------------------------------------------------
    // POST TO BACKEND
    // -----------------------------------------------------

    try {
      setSaving(true);

      console.log(
        "[DoctorPrescriptions v2] Sending:",
        payload
      );

      const response = await api.post(
        "/medications/prescriptions",
        payload
      );

      console.log(
        "[DoctorPrescriptions v2] Created:",
        response.data
      );

      setForm(initialPrescriptionForm());

      setSuccess(
        "Prescription created successfully."
      );

      await loadMedications();
    } catch (err) {
      console.error(
        "[DoctorPrescriptions v2] Failed:",
        err.response?.data || err
      );

      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  // =======================================================
  // STOP PRESCRIPTION
  // =======================================================

  const stopPrescription = async (id) => {
    const confirmed = window.confirm(
      "Stop this prescription?"
    );

    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      await api.delete(
        `/medications/prescriptions/${id}`
      );

      setSuccess(
        "Prescription stopped successfully."
      );

      await loadMedications();
    } catch (err) {
      console.error(
        "Failed to stop prescription:",
        err
      );

      setError(getApiError(err));
    }
  };

  // =======================================================
  // UI
  // =======================================================

  return (
    <div className="doctor-dashboard">

      {/* PAGE HEADER */}

      <header className="doctor-page-header">
        <div>
          <span className="doctor-eyebrow">
            TREATMENT MANAGEMENT
          </span>

          <h1>Prescriptions</h1>

          <p>
            Create and manage prescriptions for patients
            connected to your Doctor account.
          </p>

          <small>
            Prescription form v2 - dose scheduling enabled
          </small>
        </div>
      </header>

      {/* ERROR */}

      {error && (
        <div className="doctor-error" role="alert">
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      {/* SUCCESS */}

      {success && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 12,
            color: "#15803d",
          }}
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {/* PATIENT AND PRESCRIPTION FORM */}

      <section className="doctor-panel">
        <div className="doctor-panel-header">
          <div>
            <span className="doctor-eyebrow">
              SELECT PATIENT
            </span>

            <h2>
              Patient Treatment Plan
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="doctor-loading">
            <Loader2
              size={22}
              className="spin-icon"
            />

            Loading patients...
          </div>
        ) : patients.length === 0 ? (
          <div className="doctor-empty">
            <UserRound size={28} />

            <h3>No connected patients</h3>

            <p>
              Connect a patient before creating
              prescriptions.
            </p>
          </div>
        ) : (
          <>
            {/* PATIENT SELECTOR */}

            <select
              className="doctor-patient-select"
              value={selectedPatientId}
              onChange={(event) => {
                setSelectedPatientId(
                  event.target.value
                );

                setError("");
                setSuccess("");
              }}
            >
              {patients.map((patient) => (
                <option
                  key={getPatientId(patient)}
                  value={getPatientId(patient)}
                >
                  {getPatientName(patient)}
                </option>
              ))}
            </select>

            {/* PRESCRIPTION FORM */}

            <form
              className="doctor-prescription-form"
              onSubmit={createPrescription}
            >
              <div className="doctor-form-grid">

                {/* MEDICINE */}

                <Field
                  label="Medicine"
                  value={form.medicine_name}
                  placeholder="Medicine name"
                  required
                  onChange={(value) =>
                    updateForm(
                      "medicine_name",
                      value
                    )
                  }
                />

                {/* DOSAGE */}

                <Field
                  label="Dosage"
                  value={form.dosage}
                  placeholder="e.g. 500 mg"
                  required
                  onChange={(value) =>
                    updateForm("dosage", value)
                  }
                />

                {/* MEDICINE FORM */}

                <label className="doctor-field">
                  <span>Medicine Form</span>

                  <select
                    value={form.medicine_form}
                    onChange={(event) =>
                      updateForm(
                        "medicine_form",
                        event.target.value
                      )
                    }
                  >
                    <option value="Tablet">
                      Tablet
                    </option>

                    <option value="Capsule">
                      Capsule
                    </option>

                    <option value="Syrup">
                      Syrup
                    </option>

                    <option value="Injection">
                      Injection
                    </option>

                    <option value="Other">
                      Other
                    </option>
                  </select>
                </label>

                {/* SCHEDULE */}

                <Field
                  label="Schedule Description"
                  value={form.schedule}
                  placeholder="e.g. Morning and night"
                  onChange={(value) =>
                    updateForm("schedule", value)
                  }
                />

                {/* DOSES PER DAY */}

                <label className="doctor-field">
                  <span>Doses Per Day</span>

                  <select
                    value={form.doses_per_day}
                    onChange={(event) =>
                      changeDosesPerDay(
                        event.target.value
                      )
                    }
                  >
                    {[1, 2, 3, 4].map((count) => (
                      <option
                        key={count}
                        value={count}
                      >
                        {count}
                      </option>
                    ))}
                  </select>
                </label>

                {/* DOSE TIMES */}

                {form.dose_times.map(
                  (time, index) => (
                    <label
                      key={index}
                      className="doctor-field"
                    >
                      <span>
                        Dose {index + 1} Time
                      </span>

                      <input
                        type="time"
                        required
                        value={time}
                        onChange={(event) =>
                          changeDoseTime(
                            index,
                            event.target.value
                          )
                        }
                      />
                    </label>
                  )
                )}

                {/* START DATE */}

                <label className="doctor-field">
                  <span>Start Date</span>

                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(event) =>
                      updateForm(
                        "start_date",
                        event.target.value
                      )
                    }
                  />
                </label>

                {/* DURATION */}

                <label className="doctor-field">
                  <span>Duration (Days)</span>

                  <input
                    type="number"
                    min="1"
                    value={form.duration_days}
                    placeholder="Optional"
                    onChange={(event) =>
                      updateForm(
                        "duration_days",
                        event.target.value
                      )
                    }
                  />
                </label>

                {/* FOOD INSTRUCTION */}

                <label className="doctor-field">
                  <span>Food Instruction</span>

                  <select
                    value={form.food_instruction}
                    onChange={(event) =>
                      updateForm(
                        "food_instruction",
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Not specified
                    </option>

                    <option value="Before food">
                      Before food
                    </option>

                    <option value="After food">
                      After food
                    </option>

                    <option value="With food">
                      With food
                    </option>

                    <option value="Empty stomach">
                      Empty stomach
                    </option>
                  </select>
                </label>

                {/* INSTRUCTIONS */}

                <Field
                  label="Additional Instructions"
                  value={form.instructions}
                  placeholder="Optional instructions"
                  onChange={(value) =>
                    updateForm(
                      "instructions",
                      value
                    )
                  }
                />
              </div>

              {/* SUBMIT BUTTON */}

              <button
                type="submit"
                className="doctor-primary-button"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2
                      size={17}
                      className="spin-icon"
                    />

                    Saving...
                  </>
                ) : (
                  <>
                    <Plus size={17} />
                    Create Prescription
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </section>

      {/* CURRENT PRESCRIPTIONS */}

      <section className="doctor-panel">
        <div className="doctor-panel-header">
          <div>
            <span className="doctor-eyebrow">
              ACTIVE TREATMENT
            </span>

            <h2>Current Prescriptions</h2>
          </div>
        </div>

        {!selectedPatientId ? (
          <div className="doctor-empty">
            <Pill size={27} />
            <h3>Select a patient</h3>
          </div>
        ) : medications.length === 0 ? (
          <div className="doctor-empty">
            <Pill size={27} />

            <h3>No prescriptions</h3>

            <p>
              This patient currently has no
              prescription records.
            </p>
          </div>
        ) : (
          <div className="doctor-prescription-list">
            {medications.map((medication) => {
              const todayStatus =
                getTodayStatus(medication);

              const isActive =
                medication.is_active !== false &&
                String(
                  medication.status || "ACTIVE"
                ).toUpperCase() === "ACTIVE";

              return (
                <div
                  key={medication.id}
                  className="doctor-prescription-row"
                >
                  <div className="doctor-prescription-icon">
                    <Pill size={19} />
                  </div>

                  <div className="doctor-prescription-info">
                    <strong>
                      {medication.medicine_name}
                    </strong>

                    <span>
                      {medication.dosage}
                      {" • "}
                      {medication.schedule}
                    </span>

                    {Array.isArray(
                      medication.dose_times
                    ) && (
                      <p>
                        Times:{" "}
                        {medication.dose_times.join(
                          ", "
                        )}
                      </p>
                    )}

                    {medication.start_date && (
                      <p>
                        Starts:{" "}
                        {medication.start_date}
                      </p>
                    )}

                    {medication.instructions && (
                      <p>
                        {medication.instructions}
                      </p>
                    )}
                  </div>

                  <div className="doctor-adherence">
                    <span>Today</span>

                    <strong
                      className={
                        todayStatus === "Taken"
                          ? "taken"
                          : ""
                      }
                    >
                      {todayStatus}
                    </strong>
                  </div>

                  {isActive && (
                    <button
                      type="button"
                      className="doctor-stop-button"
                      onClick={() =>
                        stopPrescription(
                          medication.id
                        )
                      }
                    >
                      <Trash2 size={16} />
                      Stop
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// =========================================================
// REUSABLE TEXT FIELD
// =========================================================

function Field({
  label,
  value,
  placeholder,
  onChange,
  required = false,
}) {
  return (
    <label className="doctor-field">
      <span>{label}</span>

      <input
        type="text"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
      />
    </label>
  );
}
