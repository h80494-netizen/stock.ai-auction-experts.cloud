'use client';

import React, { useState } from 'react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultName?: string;
}

export default function ChangePasswordModal({ isOpen, onClose, defaultName = '' }: ChangePasswordModalProps) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setMsg({ type: 'error', text: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.' });
      return;
    }

    if (newPassword.length < 4) {
      setMsg({ type: 'error', text: '새 비밀번호는 4자리 이상이어야 합니다.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          current_password: currentPassword.trim(),
          new_password: newPassword.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message || '비밀번호가 성공적으로 변경되었습니다.' });
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setMsg({ type: 'error', text: data.detail || data.message || '비밀번호 변경 실패. 입력 정보를 확인해 주세요.' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버와 통신 중 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121318] border border-cyan-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative text-gray-200">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <span>🔑</span>
            <span>비밀번호 변경</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            ✕ 닫기
          </button>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          승인된 회원은 성함, 연락처 및 현재 비밀번호를 확인 후 새로운 비밀번호로 즉시 변경하실 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">성함 / 닉네임 *</label>
            <input
              type="text"
              placeholder="가입 시 등록한 성함"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">연락처 *</label>
            <input
              type="text"
              placeholder="예: 010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">현재 비밀번호 *</label>
            <input
              type="password"
              placeholder="현재 사용 중인 비밀번호"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">새 비밀번호 *</label>
              <input
                type="password"
                placeholder="4자리 이상"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">새 비밀번호 확인 *</label>
              <input
                type="password"
                placeholder="동일하게 입력"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                required
              />
            </div>
          </div>

          {msg && (
            <div className={`text-xs p-2.5 rounded-lg border font-semibold ${
              msg.type === 'success' 
                ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' 
                : 'bg-red-950/60 border-red-700 text-red-300'
            }`}>
              {msg.text}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2 rounded-xl text-xs transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-2/3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-black font-extrabold py-2 rounded-xl text-xs transition-all shadow-lg"
            >
              {isLoading ? '변경 처리 중...' : '비밀번호 변경하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
