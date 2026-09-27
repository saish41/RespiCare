import {
  ArrowRight,
  CheckCircle2,
  Copy,
  HeartHandshake,
  Link2,
  Loader2,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../../services/api";


export default function FamilyConnections() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");


  /* =====================================================
     NORMALIZE BACKEND PATIENT RESPONSE
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


  const getPatientEmail = (patient) => {
    return (
      patient?.patient_email ??
      patient?.email ??
      patient?.patient?.email ??
      ""
    );
  };


  /* =====================================================
     LOAD CONNECTED PATIENTS
  ===================================================== */

  const fetchPatients = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-patients"
      );

      setPatients(
        Array.isArray(response.data)
          ? response.data
          : []
      );

      setError("");
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load connected patients."
      );
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);


  /* =====================================================
     PAIR PATIENT
  ===================================================== */

  const handlePair = async (event) => {
    event.preventDefault();

    const cleanCode = code
      .trim()
      .toUpperCase();

    if (cleanCode.length !== 6) {
      setError(
        "Enter the 6-character pairing code provided by the patient."
      );

      setSuccess("");
      return;
    }

    try {
      setPairing(true);
      setError("");
      setSuccess("");

      await api.post(
        "/connections/pair",
        {
          code: cleanCode,
        }
      );

      setCode("");

      setSuccess(
        "Patient connected successfully."
      );

      await fetchPatients();
    } catch (err) {
      console.error(err);

      setSuccess("");

      setError(
        err.response?.data?.detail ||
          "Unable to connect patient. Check the pairing code and try again."
      );
    } finally {
      setPairing(false);
    }
  };


  /* =====================================================
     OPEN PATIENT PROFILE
  ===================================================== */

  const openPatient = (patient) => {
    const patientId =
      getPatientId(patient);

    if (!patientId) {
      return;
    }

    navigate(
      `/family/patient/${patientId}`
    );
  };


  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="guardian-dashboard">

      {/* ===============================================
          HEADER
      =============================================== */}

      <header className="guardian-header">

        <div>
          <span className="guardian-eyebrow">
            MY PATIENTS
          </span>

          <h1>
            Your Care Network
          </h1>

          <p>
            View the patients connected to your
            Family account or securely connect
            another patient using their temporary
            pairing code.
          </p>
        </div>


        <div className="guardian-header-profile">

          <div className="guardian-header-avatar">
            <UsersRound size={20} />
          </div>

          <div>
            <strong>
              Family Care
            </strong>

            <span>
              Connected caregiver
            </span>
          </div>

        </div>

      </header>


      {/* ===============================================
          MESSAGES
      =============================================== */}

      {error && (
        <div className="guardian-error">
          {error}
        </div>
      )}


      {success && (
        <div
          className="guardian-form-success"
          style={{
            marginBottom: "18px",
          }}
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}


      {/* ===============================================
          CONNECT PATIENT
      =============================================== */}

      <section className="guardian-panel">

        <div className="guardian-panel-header">

          <div className="guardian-card-title">

            <div className="guardian-card-icon care">
              <Link2 size={20} />
            </div>

            <div>
              <span>
                ADD PATIENT
              </span>

              <h2>
                Connect with pairing code
              </h2>

              <p>
                Ask the patient to generate a
                temporary pairing code from their
                RespiCare account.
              </p>
            </div>

          </div>

        </div>


        <form
          onSubmit={handlePair}
          style={{
            padding: "0 22px 24px",
          }}
        >

          <label
            htmlFor="family-pair-code"
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: 700,
              color: "#526e64",
            }}
          >
            Patient pairing code
          </label>


          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >

            <input
              id="family-pair-code"
              type="text"
              value={code}
              onChange={(event) => {
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /[^A-Z0-9]/g,
                      ""
                    )
                    .slice(0, 6)
                );

                setError("");
                setSuccess("");
              }}
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              style={{
                flex: "1 1 260px",
                minHeight: "50px",
                padding: "0 16px",
                border:
                  "1px solid #d8e7e1",
                borderRadius: "12px",
                outline: "none",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            />


            <button
              type="submit"
              className="guardian-connect-submit"
              disabled={
                pairing ||
                code.trim().length !== 6
              }
              style={{
                minHeight: "50px",
              }}
            >

              {pairing ? (
                <>
                  <Loader2
                    size={18}
                    className="spin-icon"
                  />
                  Connecting...
                </>
              ) : (
                <>
                  <HeartHandshake size={18} />
                  Connect Patient
                </>
              )}

            </button>

          </div>

        </form>

      </section>


      {/* ===============================================
          CONNECTED PATIENTS
      =============================================== */}

      <section
        className="guardian-panel"
        style={{
          marginTop: "20px",
        }}
      >

        <div className="guardian-panel-header">

          <div className="guardian-card-title">

            <div className="guardian-card-icon">
              <UsersRound size={20} />
            </div>

            <div>
              <span>
                CONNECTED PATIENTS
              </span>

              <h2>
                My Patients
              </h2>

              <p>
                Select a patient to open their
                care profile.
              </p>
            </div>

          </div>


          {!loading && (
            <div
              style={{
                fontWeight: 800,
                color: "#54766a",
              }}
            >
              {patients.length}{" "}
              {patients.length === 1
                ? "patient"
                : "patients"}
            </div>
          )}

        </div>


        {/* LOADING */}

        {loading ? (

          <div className="guardian-loading">

            <Loader2
              size={22}
              className="spin-icon"
            />

            <span>
              Loading connected patients...
            </span>

          </div>

        ) : patients.length === 0 ? (

          /* EMPTY */

          <div
            className="guardian-empty-small"
            style={{
              padding: "36px 24px",
            }}
          >

            <div>
              <UserRound size={26} />
            </div>

            <strong>
              No connected patients yet
            </strong>

            <span>
              Enter a patient's temporary pairing
              code above to create your first
              Family care connection.
            </span>

          </div>

        ) : (

          /* PATIENT LIST */

          <div
            style={{
              padding: "0 22px 24px",
              display: "grid",
              gap: "12px",
            }}
          >

            {patients.map((patient) => {
              const patientId =
                getPatientId(patient);

              const patientName =
                getPatientName(patient);

              const patientEmail =
                getPatientEmail(patient);

              return (
                <button
                  key={
                    patientId ??
                    patientName
                  }
                  type="button"
                  onClick={() =>
                    openPatient(patient)
                  }
                  className="family-patient-card clickable"
                  style={{
                    width: "100%",
                    border:
                      "1px solid #deebe6",
                    borderRadius: "16px",
                    background: "#ffffff",
                    padding: "18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >

                  {/* AVATAR */}

                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      flex: "0 0 52px",
                      borderRadius: "16px",
                      display: "grid",
                      placeItems: "center",
                      background: "#e8f6f1",
                      color: "#268464",
                    }}
                  >
                    <UserRound size={25} />
                  </div>


                  {/* DETAILS */}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >

                    <strong
                      style={{
                        display: "block",
                        color: "#244d40",
                        marginBottom: "3px",
                      }}
                    >
                      {patientName}
                    </strong>


                    <span
                      style={{
                        display: "block",
                        color: "#789087",
                      }}
                    >
                      {patientEmail ||
                        "Connected RespiCare patient"}
                    </span>


                    <span
                      style={{
                        display:
                          "inline-flex",
                        alignItems:
                          "center",
                        gap: "5px",
                        marginTop: "7px",
                        color: "#268464",
                        fontWeight: 700,
                      }}
                    >
                      <ShieldCheck size={14} />
                      Active care connection
                    </span>

                  </div>


                  {/* OPEN */}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      color: "#267c60",
                      fontWeight: 800,
                    }}
                  >
                    View Profile
                    <ArrowRight size={18} />
                  </div>

                </button>
              );
            })}

          </div>

        )}

      </section>


      {/* ===============================================
          SECURITY INFO
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
            Secure patient access
          </strong>

          <p>
            A patient must explicitly connect
            your Family account using their
            temporary pairing code. Knowing a
            patient ID alone does not provide
            access.
          </p>
        </div>

      </div>

    </div>
  );
}