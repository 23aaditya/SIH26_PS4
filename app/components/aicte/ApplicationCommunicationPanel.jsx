"use client";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { API_BASE } from "@/lib/dataService";
import { useAuth } from "@/components/providers/AuthProvider";
import { MessageSquare, Send, Users, User, Clock, CheckCheck, Sparkles, Loader2, AlertCircle } from "lucide-react";

export function ApplicationCommunicationPanel({ applicationId, initialRecipient, onClearInitialRecipient }) {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [smartContacts, setSmartContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [recipientStaffId, setRecipientStaffId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");

  const fetchCommunicationData = async () => {
    try {
      setLoading(true);
      const headers = {
        "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
      };

      const [msgRes, contactsRes] = await Promise.all([
        fetch(`${API_BASE}/applications/${applicationId}/messages`, { headers, credentials: "include" }),
        fetch(`${API_BASE}/applications/${applicationId}/contacts`, { headers, credentials: "include" }),
      ]);

      if (msgRes.ok) {
        const msgs = await msgRes.json();
        setMessages(msgs);
      }
      if (contactsRes.ok) {
        const contacts = await contactsRes.json();
        setSmartContacts(contacts);
        if (contacts.length > 0 && !recipientStaffId && !initialRecipient) {
          setRecipientStaffId(contacts[0].id);
          setRecipientName(contacts[0].name);
          setSubject(contacts[0].suggestedSubject || "Case Clarification");
        }
      }
    } catch (err) {
      console.warn("Failed to load communication thread:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (applicationId) {
      fetchCommunicationData();
    }
  }, [applicationId, userProfile]);

  useEffect(() => {
    if (initialRecipient) {
      setRecipientStaffId(initialRecipient.id || initialRecipient.employeeCode);
      setRecipientName(initialRecipient.name);
      setSubject(initialRecipient.suggestedSubject || `[${applicationId}] Discussion`);
    }
  }, [initialRecipient, applicationId]);

  const handleSelectContact = (contact) => {
    setRecipientStaffId(contact.id);
    setRecipientName(contact.name);
    setSubject(contact.suggestedSubject || `[${applicationId}] Inquiry`);
    if (onClearInitialRecipient) onClearInitialRecipient();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!recipientStaffId) {
      setError("Please choose a recipient officer.");
      return;
    }
    if (!messageText.trim()) {
      setError("Please write a message.");
      return;
    }

    try {
      setSending(true);
      setError("");

      const res = await fetch(`${API_BASE}/applications/${applicationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
        },
        credentials: "include",
        body: JSON.stringify({
          recipientStaffId,
          subject: subject.trim() || undefined,
          message: messageText.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send message.");
      }

      const newMsg = await res.json();
      setMessages((prev) => [...prev, newMsg]);
      setMessageText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Smart Contact Suggestions ("People You May Need") */}
      {smartContacts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span>People You May Need (Case Context Suggestions)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {smartContacts.map((contact) => (
              <div
                key={contact.id || contact.employeeCode}
                className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between ${
                  recipientStaffId === contact.id
                    ? "border-blue-500 bg-blue-50/50 shadow-2xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded">
                      {contact.roleLabel}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {contact.employeeCode}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{contact.name}</h4>
                  <p className="text-[11px] text-slate-500">{contact.designation}</p>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                    {contact.contextReason}
                  </p>
                </div>

                <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {recipientStaffId === contact.id ? "Selected Recipient" : "Compose Query"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Message History Thread */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white overflow-hidden rounded-xl">
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Application Dialogue Thread ({messages.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Linked to #{applicationId}
          </span>
        </div>

        <div className="p-4 space-y-3 max-h-[350px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-slate-400" />
              Loading communication records...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <MessageSquare className="h-7 w-7 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-slate-700">No application messages yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Start a conversation when clarification is required with previous or supervising officers.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isSender = m.senderStaff?.employeeCode === userProfile?.employeeCode;
              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-lg border text-xs leading-relaxed space-y-1.5 ${
                    isSender
                      ? "bg-slate-50/80 border-slate-200 ml-4"
                      : "bg-blue-50/40 border-blue-100 mr-4"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] border-b border-slate-200/40 pb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        {isSender ? "You" : m.senderStaff?.name}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-700">
                        {m.recipientStaff?.name || "Recipient"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                  </div>

                  {m.subject && (
                    <p className="font-semibold text-slate-800 text-[11px]">{m.subject}</p>
                  )}
                  <p className="text-slate-700 whitespace-pre-wrap">{m.message}</p>
                </div>
              );
            })
          )}
        </div>

        {/* 3. Compose Form */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">{error}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">Recipient Officer</Label>
              <select
                value={recipientStaffId}
                onChange={(e) => {
                  setRecipientStaffId(e.target.value);
                  const sel = smartContacts.find((c) => c.id === e.target.value);
                  if (sel) {
                    setRecipientName(sel.name);
                    setSubject(sel.suggestedSubject || subject);
                  }
                }}
                className="w-full text-xs h-8 rounded-md border border-slate-200 bg-white px-2.5 text-slate-800 font-medium outline-none focus:border-blue-500"
                required
              >
                {smartContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.designation || c.roleLabel})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">Subject / Matter</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject of clarification or query"
                className="text-xs h-8"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-700">Message Content</Label>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Write your observation or request for clarification in the context of this application..."
              className="text-xs min-h-[60px] resize-none bg-white"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-400">
              Audit log and recipient notifications will be created automatically.
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={sending}
              className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" /> Sending...
                </>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-1" /> Send Note
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
