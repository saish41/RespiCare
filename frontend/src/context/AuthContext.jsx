import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../services/api";


const AuthContext = createContext(null);


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    restoreSession();
  }, []);


  const restoreSession = async () => {
    const token = localStorage.getItem("respicare_token");

    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get("/auth/me");
      setUser(response.data);
    } catch {
      localStorage.removeItem("respicare_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };


  const login = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    localStorage.setItem(
      "respicare_token",
      response.data.access_token
    );

    setUser(response.data.user);

    return response.data.user;
  };


  const register = async (data) => {
    await api.post("/auth/register", data);

    return login(data.email, data.password);
  };


  const logout = () => {
    localStorage.removeItem("respicare_token");
    setUser(null);
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  return useContext(AuthContext);
}