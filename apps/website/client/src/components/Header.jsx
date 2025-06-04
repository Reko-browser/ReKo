import { Link } from "react-router-dom";

function Header() {
  return (
    <header>
      <h1>ReKo</h1>
      <nav>
        <ul>
          <li>
            <Link to={"/"}>Home</Link>
          </li>
          <li>
            <Link to={"/about"}>About</Link>
          </li>
          <li>
            <Link to={"/contact"}>Contact</Link>
          </li>
          <li>
            <Link to={"/download"}>Download</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;
