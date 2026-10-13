'use client';

import React, { useState, useEffect } from 'react';

interface UserRequestItem {
  id: number;
  name: string;
  phone: string;
  email: string;
  requested_password: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at: string | null;
}

interface AdminApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminApprovalModal({ isOpen, onClose }: AdminApprovalModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [requests, setRequests] = useState<UserRequestItem[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<number, boolean>>({});
  
  // 비밀번호 수정 인라인 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const fetchRequests = async (pwd?: string) => {
    const targetPassword = pwd || adminPassword;
    if (!targetPassword) {
      setMsg({ type: 'error', text: '관리자 암호를 입력해 주세요.' });
      return;
    }

    setIsLoading(true);
    setMsg(null);

    try {
      const res = await fetch('/api/auth/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: targetPassword })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setRequests(data.data || []);
      } else {
        setMsg({ type: 'error', text: data.detail || '관리자 권한 인증에 실패했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버와 통신할 수 없습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (requestId: number, newStatus: 'approved' | 'rejected' | 'pending') => {
    if (!adminPassword) {
      setMsg({ type: 'error', text: '관리자 암호를 먼저 입력해 주세요.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword,
          request_id: requestId,
          status: newStatus
        })
      });
      if (res.ok) {
        fetchRequests(adminPassword);
      } else {
        setMsg({ type: 'error', text: '상태 변경에 실패했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '오류가 발생했습니다.' });
    }
  };

  const handleResetPassword = async (requestId: number) => {
    if (!adminPassword) {
      setMsg({ type: 'error', text: '관리자 암호가 필요합니다.' });
      return;
    }
    if (!newPasswordInput.trim() || newPasswordInput.trim().length < 4) {
      setMsg({ type: 'error', text: '새 비밀번호는 4자리 이상 입력해 주세요.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_password: adminPassword,
          request_id: requestId,
          new_password: newPasswordInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: '비밀번호가 성공적으로 수정되었습니다.' });
        setEditingId(null);
        setNewPasswordInput('');
        fetchRequests(adminPassword);
      } else {
        setMsg({ type: 'error', text: data.detail || data.message || '비밀번호 변경 실패' });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: '서버 통신 실패' });
    }
  };

  const toggleShowPassword = (id: number) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121318] border border-red-500/50 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-2xl max-h-[90vh] flex flex-col text-gray-200">
        
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h3 className="text-lg font-bold text-red-400">
              주인장 비밀번호 승인 DB 관리 (보안 구역)
            </h3>
            <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full font-mono">
              ADMIN ONLY
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            ✕ 닫기
          </button>
        </div>

        {/* 관리자 암호 검증 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/90 p-3.5 rounded-xl border border-gray-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 font-bold whitespace-nowrap">관리자 마스터 암호:</span>
            <input
              type="password"
              placeholder="관리자 암호 입력"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchRequests();
              }}
              className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono outline-none focus:border-red-500 w-44"
              autoFocus
            />
            <button
              onClick={() => fetchRequests()}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow cursor-pointer"
            >
              {isLoading ? '조회 중...' : '조회 / 새로고침'}
            </button>
          </div>
          <div className="text-[11px] text-gray-400">
            총 {requests.length}건 등록됨
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

        {/* 신청자 DB 테이블 */}
        <div className="flex-1 overflow-y-auto border border-gray-800 rounded-xl bg-black/60 min-h-[300px]">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-gray-400 animate-pulse">
              승인 데이터 조회 중입니다...
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500">
              {adminPassword ? '등록된 승인 요청 내역이 없거나 조회되지 않았습니다.' : '관리자 암호를 입력하고 [조회] 버튼을 눌러주세요.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-900/90 text-gray-400 uppercase font-mono border-b border-gray-800 sticky top-0 backdrop-blur-sm">
                <tr>
                  <th className="p-2.5">ID</th>
                  <th className="p-2.5">성함</th>
                  <th className="p-2.5">연락처</th>
                  <th className="p-2.5">이메일</th>
                  <th className="p-2.5">비밀번호</th>
                  <th className="p-2.5">신청일시</th>
                  <th className="p-2.5">상태</th>
                  <th className="p-2.5 text-center">승인 및 비번관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono text-gray-300">
                {requests.map((req) => {
                  const isPwVisible = !!showPasswordMap[req.id];
                  const isEditingThis = editingId === req.id;

                  return (
                    <tr key={req.id} className="hover:bg-gray-900/60 transition-colors">
                      <td className="p-2.5 text-gray-500">{req.id}</td>
                      <td className="p-2.5 font-bold text-white">{req.name}</td>
                      <td className="p-2.5 text-cyan-300">{req.phone}</td>
                      <td className="p-2.5 text-gray-400">{req.email || '-'}</td>
                      
                      {/* 비밀번호 (기본 마스킹 처리) */}
                      <td className="p-2.5">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="새 비번"
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              className="w-20 bg-gray-900 border border-yellow-500 rounded px-1.5 py-0.5 text-xs text-yellow-300 font-mono outline-none"
                            />
                            <button
                              onClick={() => handleResetPassword(req.id)}
                              className="bg-yellow-600 hover:bg-yellow-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setNewPasswordInput('');
                              }}
                              className="bg-gray-700 text-gray-300 px-1 py-0.5 rounded text-[10px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-yellow-400">
                              {isPwVisible ? req.requested_password : '••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(req.id)}
                              className="text-[10px] text-gray-500 hover:text-gray-300 px-1 py-0.5 border border-gray-700 rounded"
                              title={isPwVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                            >
                              {isPwVisible ? '숨김' : '보기'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(req.id);
                                setNewPasswordInput(req.requested_password);
                              }}
                              className="text-[10px] text-cyan-400 hover:text-cyan-300 px-1 py-0.5 border border-cyan-800 rounded ml-1"
                              title="관리자 권한으로 비밀번호 직접 변경"
                            >
                              수정
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="p-2.5 text-gray-400 text-[11px] whitespace-nowrap">
                        {req.created_at}
                      </td>

                      <td className="p-2.5 whitespace-nowrap">
                        {req.status === 'approved' && (
                          <span className="bg-emerald-950 text-emerald-400 border border-emerald-700 px-2 py-0.5 rounded text-[11px] font-bold">
                            승인됨
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span className="bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded text-[11px] font-bold">
                            거절됨
                          </span>
                        )}
                        {req.status === 'pending' && (
                          <span className="bg-amber-950 text-amber-300 border border-amber-700 px-2 py-0.5 rounded text-[11px] font-bold">
                            대기 중
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 text-center space-x-1 whitespace-nowrap">
                        {req.status !== 'approved' && (
                          <button
                            onClick={() => handleStatusChange(req.id, 'approved')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                          >
                            승인
                          </button>
                        )}
                        {req.status !== 'rejected' && (
                          <button
                            onClick={() => handleStatusChange(req.id, 'rejected')}
                            className="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                          >
                            거절
                          </button>
                        )}
                        {req.status !== 'pending' && (
                          <button
                            onClick={() => handleStatusChange(req.id, 'pending')}
                            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded text-[11px] font-bold transition-all shadow"
                          >
                            대기
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 닫기 버튼 */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-6 py-2 rounded-xl text-xs transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
}
