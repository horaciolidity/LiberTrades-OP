// src/components/Banner.jsx
import React from "react";
import logo from "@/assets/logo-libertrades.png"; // usa la ruta de tu logo

export default function Banner() {
  return (
    <div className="relative w-full bg-gradient-to-r from-purple-700/80 via-indigo-700/80 to-blue-700/80 text-white flex items-center justify-center py-3 shadow-lg backdrop-blur-md z-50">
      <img src={logo} alt="LiberTrades Logo" className="h-10 mr-3 drop-shadow-lg" />
      <h1 className="text-xl font-bold tracking-wide">LiberTrades OP</h1>
    </div>
  );
}
