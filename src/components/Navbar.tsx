import React, { useState } from "react";
import { ModeToggle } from "./mode-toggle";

export const Navbar: React.FC = () => {
  return (
    <header className="flex py-1 items-center justify-between px-4 md:px-6">
      <ModeToggle />
    </header>
  );
};
