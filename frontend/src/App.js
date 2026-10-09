
import React, { useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

function App() {
  const [msg, setMsg] = useState("");
  const [emailList, setEmailList] = useState([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("idle");
  const [sendResult, setSendResult] = useState("");

  function handlemsg(event) {
    setMsg(event.target.value);
    setSendResult("");
  }

  function handlefile(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    setEmailList([]);
    setFileName("");
    setSendResult("");
    setStatus("idle");

    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        const workbook = XLSX.read(e.target.result, {
          type: "array",
        });

        const firstSheet = workbook.SheetNames[0];

        if (!firstSheet) {
          setSendResult("No worksheet found in this Excel file.");
          return;
        }

        const worksheet = workbook.Sheets[firstSheet];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        const validEmails = [
          ...new Set(
            rows
              .map((row) => String(row[0] ?? "").trim())
              .filter((email) =>
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
              )
              .map((email) => email.toLowerCase())
          ),
        ];

        if (validEmails.length === 0) {
          setSendResult(
            "No valid email addresses found in column A. Check your Excel file."
          );
          return;
        }

        setEmailList(validEmails);
        setFileName(file.name);
        setStatus("idle");

        setSendResult(
          `${validEmails.length} valid email address(es) loaded successfully.`
        );
      } catch (error) {
        console.error("Excel parsing error:", error);
        setSendResult("Unable to read this Excel file.");
      }
    };

    reader.onerror = function () {
      setSendResult("Unable to open the selected file.");
    };

    reader.readAsArrayBuffer(file);
  }

  async function sendEmails() {
    if (!msg.trim()) {
      setSendResult("Please enter an email message.");
      return;
    }

    if (emailList.length === 0) {
      setSendResult(
        "Please upload an Excel file with valid email addresses."
      );
      return;
    }

    setStatus("sending");
    setSendResult("Sending emails. Please wait...");

    try {
      const response = await axios.post(
        "https://bulkmail-backend-vypd.onrender.com/sendemail",
        {
          msg: msg.trim(),
          emailList: emailList,
        },
        {
          timeout: 120000,
        }
      );

      if (
        response.data?.status === "failed" ||
        response.data?.success === false
      ) {
        setStatus("error");
        setSendResult(
          response.data?.message ||
            response.data?.error ||
            "The backend reported that email sending failed."
        );
      } else {
        setStatus("success");
        setSendResult(
          response.data?.message ||
            "The server accepted the email request. Check campaign history to confirm delivery."
        );
      }
    } catch (error) {
      console.error("Email sending error:", error);

      setStatus("error");

      if (error.code === "ECONNABORTED") {
        setSendResult(
          "Request timed out after 30 seconds. Check campaign history before trying again."
        );
      } else if (error.response) {
        setSendResult(
          error.response.data?.message ||
            error.response.data?.error ||
            `Server error: ${error.response.status}. Check your backend logs.`
        );
      } else {
        setSendResult(
          "Unable to reach the backend. Check the backend service and network connection."
        );
      }
    } finally {
      setStatus((currentStatus) =>
        currentStatus === "sending" ? "error" : currentStatus
      );
    }
  }

  function clearRecipients() {
    setEmailList([]);
    setFileName("");
    setSendResult("");
    setStatus("idle");

    const fileInput = document.getElementById("excel-file");

    if (fileInput) {
      fileInput.value = "";
    }
  }

  const statusLabel = {
    idle: "Ready",
    sending: "Sending",
    success: "Completed",
    error: "Error",
  };

  const statusDot = {
    idle: "bg-gray-400",
    sending: "bg-yellow-500",
    success: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">BulkMail</h1>
            <p className="mt-1 text-sm text-gray-500">
              Simple bulk email management
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600">
            <span
              className={`h-2 w-2 rounded-full ${statusDot[status]}`}
            />
            {statusLabel[status]}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Create an email campaign
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Upload your recipient list, write your message, and send.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
          <section className="space-y-6 md:col-span-3">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold">1. Recipients</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Upload an Excel file with email addresses in column A.
                </p>
              </div>

              <label
                htmlFor="excel-file"
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 px-5 py-8 text-center transition hover:border-blue-500 hover:bg-gray-50"
              >
                <svg
                  className="mb-3 h-8 w-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"
                  />
                </svg>

                <span className="text-sm font-medium text-gray-800">
                  {fileName || "Choose an Excel file"}
                </span>

                <span className="mt-1 text-xs text-gray-500">
                  .xlsx or .xls
                </span>

                <input
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handlefile}
                  className="hidden"
                />
              </label>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Recipients loaded
                </span>
                <span className="rounded-md bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-800">
                  {emailList.length}
                </span>
              </div>

              {emailList.length > 0 && (
                <div className="mt-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <span className="text-sm font-medium">
                      Recipient preview
                    </span>

                    <button
                      type="button"
                      onClick={clearRecipients}
                      disabled={status === "sending"}
                      className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove list
                    </button>
                  </div>

                  <div className="max-h-40 overflow-y-auto p-4">
                    {emailList.slice(0, 10).map((email, index) => (
                      <div
                        key={`${email}-${index}`}
                        className="truncate py-1 text-sm text-gray-600"
                      >
                        {email}
                      </div>
                    ))}

                    {emailList.length > 10 && (
                      <p className="mt-2 text-xs text-gray-400">
                        And {emailList.length - 10} more recipient(s)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold">
                  2. Email message
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Write the message you want to send.
                </p>
              </div>

              <label
                htmlFor="email-message"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Message
              </label>

              <textarea
                id="email-message"
                value={msg}
                onChange={handlemsg}
                placeholder="Write your email message here..."
                rows={8}
                className="w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <div className="mt-2 text-right text-xs text-gray-400">
                {msg.length} characters
              </div>
            </div>
          </section>

          <aside className="md:col-span-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-base font-semibold">
                Campaign summary
              </h3>

              <div className="mt-5 divide-y divide-gray-100">
                <div className="flex items-center justify-between py-4">
                  <span className="text-sm text-gray-500">Recipients</span>
                  <span className="text-sm font-semibold">
                    {emailList.length}
                  </span>
                </div>

                <div className="flex items-center justify-between py-4">
                  <span className="text-sm text-gray-500">Message</span>
                  <span className="text-sm font-medium">
                    {msg.trim() ? "Added" : "Not added"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-4">
                  <span className="text-sm text-gray-500">Excel file</span>
                  <span className="max-w-36 truncate text-sm font-medium">
                    {fileName || "None"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={sendEmails}
                disabled={
                  status === "sending" ||
                  !msg.trim() ||
                  emailList.length === 0
                }
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {status === "sending" ? "Sending..." : "Send emails"}
              </button>

              <p className="mt-3 text-center text-xs leading-5 text-gray-500">
                Verify your recipient list and message before sending.
              </p>
            </div>

            {sendResult && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-4 rounded-lg border p-4 text-sm ${
                  status === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : status === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {sendResult}
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-10 border-t border-gray-200 pt-5 text-center text-xs text-gray-400">
          BulkMail · Bulk email management
        </footer>
      </main>
    </div>
  );
}

export default App;

