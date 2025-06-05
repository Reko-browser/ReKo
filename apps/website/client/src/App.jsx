import {
  BrowserRouter,
  Route,
  Routes,
  useSearchParams,
} from "react-router-dom";
import "./App.css";
import Header from "./components/Header.jsx";
import Admin from "./components/Admin.jsx";
import { useState, useEffect } from "react";

function AppContent() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    const messageParam = searchParams.get("message");
    const typeParam = searchParams.get("type");

    if (messageParam && typeParam) {
      setMessage(messageParam);
      setType(typeParam);
    }
  }, [searchParams]);

  // Function to handle closing the message
  const handleCloseMessage = () => {
    setMessage("");
    setType("");
  };

  return (
    <>
      <Header />
      <div className="message-container">
        {message && (
          <p className={`message ${type}`}>
            {message}
            <span onclick={handleCloseMessage}>X</span>
          </p>
        )}
      </div>
      <main>
        <Routes>
          <Route exact path="/" element={<h1>Home</h1>} />
          <Route exact path="/about" element={<h1>About</h1>} />
          <Route exact path="/contact" element={<h1>Contact</h1>} />
          <Route exact path="/download" element={<h1>Download</h1>} />
          <Route exact path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
