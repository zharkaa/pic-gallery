import React, { useState } from "react";

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <nav className="bg-slate-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="shrink-0 font-bold text-xl tracking-wide">
            <a href="#" className="hover:text-blue-400 transition-colors">
              Gallery
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            <a href="#home" className="hover:text-blue-400 transition-colors">
              Home
            </a>
            <a href="#about" className="hover:text-blue-400 transition-colors">
              About
            </a>
            <a href="#services" className="hover:text-blue-400 transition-colors">
              Services
            </a>
            <a href="#contact" className="hover:text-blue-400 transition-colors">
              Contact
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="text-gray-300 hover:text-white focus:outline-none focus:text-white p-2"
              aria-label="Toggle Menu"
            >
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                {isOpen ? (
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M18.364 18.364a1 1 0 000-1.414L13.414 12l4.95-4.95a1 1 0 00-1.414-1.414L12 10.586l-4.95-4.95a1 1 0 00-1.414 1.414L10.586 12l-4.95 4.95a1 1 0 101.414 1.414L12 13.414l4.95 4.95a1 1 0 001.414 0z"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M4 5h16a1 1 0 010 2H4a1 1 0 100-2zm0 6h16a1 1 0 010 2H4a1 1 0 010-2zm0 6h16a1 1 0 010 2H4a1 1 0 010-2z"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isOpen && (
        <div className="md:hidden bg-slate-800 px-2 pt-2 pb-4 space-y-1 sm:px-3 border-t border-slate-700">
          <a
            href="#home"
            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-slate-700 hover:text-blue-400 transition-colors"
          >
            Home
          </a>
          <a
            href="#about"
            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-slate-700 hover:text-blue-400 transition-colors"
          >
            About
          </a>
          <a
            href="#services"
            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-slate-700 hover:text-blue-400 transition-colors"
          >
            Services
          </a>
          <a
            href="#contact"
            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-slate-700 hover:text-blue-400 transition-colors"
          >
            Contact
          </a>
        </div>
      )}
    </nav>
  );
};
