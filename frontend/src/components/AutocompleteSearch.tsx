import React, { useState, useEffect, useRef } from 'react';

interface AutocompleteSearchProps {
  localStocks?: any[];
  onSelect: (ticker: string) => void;
  placeholder?: string;
}

export default function AutocompleteSearch({ localStocks = [], onSelect, placeholder = "종목명/티커 검색" }: AutocompleteSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const fetchSuggestions = async () => {
      const q = query.toLowerCase().trim();
      
      // 1. Local matching (allows Korean support if localStocks has it)
      const localMatches = localStocks.filter(s => 
        (s.name && s.name.toLowerCase().includes(q)) || 
        (s.symbol && s.symbol.toLowerCase().includes(q)) ||
        (s.ticker && s.ticker.toLowerCase().includes(q))
      ).map(s => ({
        ticker: s.ticker || s.symbol,
        name: s.name,
        exchange: s.source || 'Local'
      })).slice(0, 5);

      // 2. Global matching
      try {
        const res = await fetch(`/api/stock/autocomplete?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const globalMatches = await res.json();
        
        // Merge without duplicates
        const merged = [...localMatches];
        const seen = new Set(localMatches.map(m => m.ticker));
        
        for (const m of globalMatches) {
          if (!seen.has(m.ticker)) {
            seen.add(m.ticker);
            merged.push(m);
          }
        }
        
        setSuggestions(merged.slice(0, 8));
        setIsOpen(true);
      } catch (e) {
        setSuggestions(localMatches);
        setIsOpen(true);
      }
    };

    const debounceId = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(debounceId);
  }, [query, localStocks]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (q) {
      // If user typed exact name or ticker, resolve to ticker
      const match = suggestions.find(s => 
        s.name.toLowerCase() === q.toLowerCase() || 
        s.ticker.toLowerCase() === q.toLowerCase()
      ) || localStocks.find(s => 
        (s.name && s.name.toLowerCase() === q.toLowerCase()) || 
        (s.ticker && s.ticker.toLowerCase() === q.toLowerCase()) ||
        (s.symbol && s.symbol.toLowerCase() === q.toLowerCase())
      );
      
      if (match) {
        onSelect(match.ticker || match.symbol);
      } else {
        onSelect(q); // Fallback to raw query if no exact match found
      }
      setIsOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex-1 flex">
      <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
        <input 
          type="text" 
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
        />
        <button 
          type="submit"
          className="bg-blue-900 hover:bg-blue-700 text-white px-3 rounded text-xs transition-colors whitespace-nowrap"
        >
          검색
        </button>
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 mt-1 w-[250px] max-h-60 overflow-y-auto bg-[#1a1a1a] border border-gray-700 rounded shadow-lg">
          {suggestions.map((s, idx) => (
            <li 
              key={`${s.ticker}-${idx}`}
              onClick={() => {
                onSelect(s.ticker);
                setQuery("");
                setIsOpen(false);
              }}
              className="px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer border-b border-gray-800 last:border-0 flex justify-between items-center"
            >
              <div className="flex flex-col">
                <span className="font-bold text-white">{s.ticker}</span>
                <span className="text-gray-400 max-w-[150px] truncate">{s.name}</span>
              </div>
              <span className="text-[10px] text-gray-500 bg-black px-1 rounded truncate max-w-[60px]">{s.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
