"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  FileSpreadsheet, 
  Upload, 
  Trash2, 
  Settings, 
  Play, 
  Download, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  FileText,
  Key,
  Database,
  RefreshCw,
  FolderOpen,
  ChevronRight,
  FileCheck2,
  Lock,
  ArrowRight
} from "lucide-react";

// AG Grid Imports
import { AgGridReact, AgGridProvider } from "ag-grid-react";
import { AllCommunityModule } from "ag-grid-community";


// Dynamic API url to bypass loopback sandboxing
const DEFAULT_API_URL = "http://127.0.0.1:8000/api";

interface Transaction {
  date: string;
  description: string;
  reference: string;
  debit: string | number;
  credit: string | number;
  balance: string | number;
}

interface ExtractedData {
  bank_name: string;
  account_number: string;
  account_holder: string;
  statement_period: string;
  transactions: Transaction[];
}

interface Document {
  id: string;
  filename: string;
  status: string;
  ocr_engine?: string;
  ai_provider?: string;
  error_message?: string;
  created_at: string;
}

interface ProviderSetting {
  provider_name: string;
  base_url: string | null;
  model_name: string | null;
  has_key: boolean;
  additional_params: any | null;
}

export default function Home() {
  const [token, setToken] = useState<string | null>("local-session");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_URL);
  
  // Dashboard state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderSetting[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("Groq");
  const [azureConfig, setAzureConfig] = useState<any>(null);
  const hasAutoSelectedRef = useRef(false);
  
  // SharePoint Settings State
  const [spTenantId, setSpTenantId] = useState("");
  const [spClientId, setSpClientId] = useState("");
  const [spClientSecret, setSpClientSecret] = useState("");
  const [spSiteUrl, setSpSiteUrl] = useState("");
  const [spLibraryName, setSpLibraryName] = useState("Documents");
  const [spBaseFolder, setSpBaseFolder] = useState("ProcessedDocuments");
  const [spCreateYearFolder, setSpCreateYearFolder] = useState(true);
  const [spCreateMonthFolder, setSpCreateMonthFolder] = useState(true);
  const [spToken, setSpToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"ai" | "sharepoint">("ai");
  const [isAzureConfigLoaded, setIsAzureConfigLoaded] = useState(false);

  
  // Modals & Panels
  const [uploadSuccessDetails, setUploadSuccessDetails] = useState<{
    filename: string;
    sharepointUrl: string;
    siteUrl: string;
    libraryName: string;
    folderPath: string;
  } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadingToSp, setIsUploadingToSp] = useState(false);
  const [editProvider, setEditProvider] = useState<ProviderSetting | null>(null);
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModelName, setEditModelName] = useState("");
  
  // UI Status
  const [uploadProgress, setUploadProgress] = useState(false);
  const [processingDocs, setProcessingDocs] = useState<Record<string, boolean>>({});
  const [downloadedDocs, setDownloadedDocs] = useState<Record<string, boolean>>({});
  const [reconciliationScore, setReconciliationScore] = useState<{ status: string; text: string; balanced: boolean }>({
    status: "UNKNOWN",
    text: "No balance data available.",
    balanced: false
  });
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const gridRef = useRef<any>(null);
  const msalInstanceRef = useRef<any>(null);
  const initializedMsalInstanceRef = useRef<any>(null);

  const clearMsalInteractionStatus = () => {
    if (typeof window !== "undefined") {
      const keysToClear = [
        "msal.interaction.status",
        "msal.login.request",
        "msal.request.keys"
      ];
      keysToClear.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.includes("interaction.status") || k.includes("interaction_status"))) {
          localStorage.removeItem(k);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && (k.includes("interaction.status") || k.includes("interaction_status"))) {
          sessionStorage.removeItem(k);
        }
      }
    }
  };

  const getMsalInstance = async (clientId: string, tenantId: string) => {
    if (initializedMsalInstanceRef.current) {
      return initializedMsalInstanceRef.current;
    }
    const PublicClientAppClass = msalInstanceRef.current || (await import("@azure/msal-browser")).PublicClientApplication;
    const msalConfig = {
      auth: {
        clientId: clientId,
        authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
        redirectUri: window.location.origin
      },
      cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
      }
    };
    const instance = new PublicClientAppClass(msalConfig);
    await instance.initialize();
    initializedMsalInstanceRef.current = instance;
    return instance;
  };

  // Initial Load & Auth Bypass Hook
  // Initial Load & Auth Bypass Hook
  useEffect(() => {
    const activeToken = "local-session";
    setToken(activeToken);

    let hostname = window.location.hostname;
    if (hostname === "localhost") {
      hostname = "127.0.0.1";
    }
    const resolvedUrl = `${window.location.protocol}//${hostname}:8000/api`;
    setApiBaseUrl(resolvedUrl || DEFAULT_API_URL);

    fetchDocuments(activeToken, resolvedUrl);
    fetchProviderSettings(activeToken, resolvedUrl);
    fetchAzureSettings(activeToken, resolvedUrl);

    if (typeof window !== "undefined") {
      const storedClientId = localStorage.getItem("sp_client_id") || "";
      const storedTenantId = localStorage.getItem("sp_tenant_id") || "";
      const storedClientSecret = localStorage.getItem("sp_client_secret") || "";
      setSpTenantId(storedTenantId);
      setSpClientId(storedClientId);
      setSpClientSecret(storedClientSecret);
      
      setSpSiteUrl(localStorage.getItem("sp_site_url") || "");
      const storedLibrary = localStorage.getItem("sp_library_name");
      if (!storedLibrary) {
        localStorage.setItem("sp_library_name", "Documents");
      }
      setSpLibraryName(storedLibrary || "Documents");

      const storedFolder = localStorage.getItem("sp_base_folder");
      if (!storedFolder) {
        localStorage.setItem("sp_base_folder", "ProcessedDocuments");
      }
      setSpBaseFolder(storedFolder || "ProcessedDocuments");

      setSpCreateYearFolder(localStorage.getItem("sp_create_year") !== "false");
      setSpCreateMonthFolder(localStorage.getItem("sp_create_month") !== "false");
      setSpToken(sessionStorage.getItem("sp_token") || null);
    }
  }, []);

  // MSAL Initialization, Redirection & Backend Code Redemption Hook
  useEffect(() => {
    if (!isAzureConfigLoaded) return;

    const currentClientId = spClientId || (azureConfig && azureConfig.client_id);
    const currentTenantId = spTenantId || (azureConfig && azureConfig.tenant_id);
    const currentClientSecret = spClientSecret;
    const hasSecret = currentClientSecret || (azureConfig && azureConfig.has_secret);
    const activeToken = token || "local-session";

    if (typeof window !== "undefined") {
      // 1. If Client Secret is configured (either in UI or backend), handle manual redirect code exchange & bypass MSAL Browser
      if (hasSecret) {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get("code");
        if (authCode && currentClientId) {
          // Clean the URL parameters immediately to prevent looping
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          const pendingDocId = sessionStorage.getItem("pending_upload_doc_id");
          const pendingDataStr = sessionStorage.getItem("pending_upload_data");

          // Clear synchronously immediately to block double-triggering in React Strict Mode
          sessionStorage.removeItem("pending_upload_doc_id");
          sessionStorage.removeItem("pending_upload_data");

          setAuthStatus("authenticating");
          fetch(`${apiBaseUrl}/settings/sharepoint/redeem-code`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${activeToken}`
            },
            body: JSON.stringify({
              code: authCode,
              redirect_uri: window.location.origin,
              tenant_id: currentTenantId,
              client_id: currentClientId,
              client_secret: currentClientSecret
            })
          })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              if (data.access_token) {
                setSpToken(data.access_token);
                sessionStorage.setItem("sp_token", data.access_token);
                setAuthStatus("success");

                // Auto-trigger any pending upload using closure values
                if (pendingDocId && pendingDataStr) {
                  try {
                    const pendingData = JSON.parse(pendingDataStr);
                    await autoExportExcel(pendingDocId, pendingData, activeToken);
                  } catch (e) {
                    console.error("Auto-trigger redirect upload failed:", e);
                  }
                }
              }
            } else {
              const errText = await res.text();
              console.error("Redemption failed:", errText);
              setAuthStatus("failed");
            }
          })
          .catch(err => {
            console.error("Redeem fetch error:", err);
            setAuthStatus("failed");
          });
        } else {
          // Strip code/state from URL if using client secret flow and no new code is present
          if (window.location.hash.includes("code=") || window.location.search.includes("code=")) {
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        }
        return; // Bypasses MSAL browser redirection initialization completely!
      }

      // 2. Otherwise, fall back to standard MSAL Browser redirect handler (requires SPA configuration)
      if (currentClientId) {
        import("@azure/msal-browser")
          .then(async (m) => {
            msalInstanceRef.current = m.PublicClientApplication;
            try {
              const msalInstance = await getMsalInstance(currentClientId, currentTenantId);
              const redirectRes = await msalInstance.handleRedirectPromise();
              if (redirectRes && redirectRes.accessToken) {
                setSpToken(redirectRes.accessToken);
                sessionStorage.setItem("sp_token", redirectRes.accessToken);
                setAuthStatus("success");

                // Execute any pending upload after Microsoft login redirects back
                const pendingDocId = sessionStorage.getItem("pending_upload_doc_id");
                const pendingDataStr = sessionStorage.getItem("pending_upload_data");
                if (pendingDocId && pendingDataStr) {
                  try {
                    const pendingData = JSON.parse(pendingDataStr);
                    sessionStorage.removeItem("pending_upload_doc_id");
                    sessionStorage.removeItem("pending_upload_data");
                    await autoExportExcel(pendingDocId, pendingData, activeToken);
                  } catch (e) {
                    console.error("Auto-trigger redirect upload failed:", e);
                  }
                }
              }
            } catch (err: any) {
              console.error("MSAL redirect parse failed:", err);
              if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
              if (err.errorCode === "interaction_in_progress" || err.message?.includes("interaction_in_progress")) {
                console.warn("Interaction in progress on load. Clearing status...");
                clearMsalInteractionStatus();
              }
            }
          })
          .catch((err) => console.error("MSAL preload failed:", err));
      }
    }
  }, [isAzureConfigLoaded, spClientId, spClientSecret, azureConfig, token, apiBaseUrl]);

  // Poll processing items with support for Auto-Download
  useEffect(() => {
    if (!token) return;
    const hasProcessing = documents.some(doc => doc.status === "processing" || doc.status === "uploaded");
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        // Fetch current document list
        const res = await fetch(`${apiBaseUrl}/documents/`, { headers: headers(token) });
        if (res.ok) {
          const data = await res.json();
          setDocuments(data);
          
          // If we have a selected document, refresh its state
          if (selectedDoc) {
            const updatedDoc = data.find((d: any) => d.id === selectedDoc.id);
            if (updatedDoc) {
              setSelectedDoc(updatedDoc);
              // Trigger preview fetch once finished
              if (updatedDoc.status === "completed" && !extractedData) {
                fetchPreview(updatedDoc.id, token);
              }
            }
          }
        }
      } catch (e) {
        console.error("Polling fetch failed:", e);
      }
    }, 3005);

    return () => clearInterval(interval);
  }, [documents, selectedDoc, token, extractedData, apiBaseUrl]);

  // Reconciliation auditor logic
  useEffect(() => {
    if (!extractedData || !extractedData.transactions || extractedData.transactions.length === 0) {
      setReconciliationScore({ status: "UNKNOWN", text: "No transactions to audit.", balanced: false });
      return;
    }

    const txs = extractedData.transactions;
    let checkCount = 0;
    let passCount = 0;
    let missingBalance = false;

    const cleanNum = (val: any) => {
      if (val === null || val === undefined || String(val).trim() === "") return 0;
      const num = parseFloat(String(val).replace(/[$,]/g, "").trim());
      return isNaN(num) ? 0 : num;
    };

    for (let i = 1; i < txs.length; i++) {
      const prevBal = cleanNum(txs[i-1].balance);
      const currBal = cleanNum(txs[i].balance);
      const debit = cleanNum(txs[i].debit);
      const credit = cleanNum(txs[i].credit);

      if (txs[i-1].balance && txs[i].balance) {
        checkCount++;
        const expected = prevBal - debit + credit;
        if (Math.abs(expected - currBal) <= 0.02) {
          passCount++;
        }
      } else {
        missingBalance = true;
      }
    }

    if (checkCount === 0) {
      setReconciliationScore({
        status: "WARNING",
        text: missingBalance ? "Running balances are incomplete." : "No balance checkable checkpoints.",
        balanced: false
      });
    } else {
      const balanced = passCount === checkCount;
      setReconciliationScore({
        status: balanced ? "PASSED" : "FAILED",
        text: balanced 
          ? `All ${checkCount} ledger balances reconcile successfully.` 
          : `Audit alert: ${checkCount - passCount} offset rows found.`,
        balanced: balanced
      });
    }
  }, [extractedData]);

  // Headers
  const headers = (authToken: string) => ({
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json"
  });

  const fetchDocuments = async (authToken: string, urlOverride?: string) => {
    try {
      const targetUrl = urlOverride || apiBaseUrl;
      const res = await fetch(`${targetUrl}/documents/`, { headers: headers(authToken) });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAzureSettings = async (authToken: string, urlOverride?: string) => {
    try {
      const targetUrl = urlOverride || apiBaseUrl;
      const res = await fetch(`${targetUrl}/settings/azure`, { headers: headers(authToken) });
      if (res.ok) {
        const data = await res.json();
        setAzureConfig(data);
        if (typeof window !== "undefined") {
          if ((!localStorage.getItem("sp_tenant_id") || localStorage.getItem("sp_tenant_id") === "") && data.tenant_id) {
            setSpTenantId(data.tenant_id);
            localStorage.setItem("sp_tenant_id", data.tenant_id);
          }
          if ((!localStorage.getItem("sp_client_id") || localStorage.getItem("sp_client_id") === "") && data.client_id) {
            setSpClientId(data.client_id);
            localStorage.setItem("sp_client_id", data.client_id);
          }
          if ((!localStorage.getItem("sp_site_url") || localStorage.getItem("sp_site_url") === "") && data.sp_site_url) {
            setSpSiteUrl(data.sp_site_url);
            localStorage.setItem("sp_site_url", data.sp_site_url);
          }
          if ((!localStorage.getItem("sp_library_name") || localStorage.getItem("sp_library_name") === "") && data.sp_library_name) {
            setSpLibraryName(data.sp_library_name);
            localStorage.setItem("sp_library_name", data.sp_library_name);
          }
          if ((!localStorage.getItem("sp_base_folder") || localStorage.getItem("sp_base_folder") === "") && data.sp_base_folder) {
            setSpBaseFolder(data.sp_base_folder);
            localStorage.setItem("sp_base_folder", data.sp_base_folder);
          }
          if (localStorage.getItem("sp_create_year") === null && data.sp_create_year_folder !== undefined) {
            setSpCreateYearFolder(data.sp_create_year_folder);
            localStorage.setItem("sp_create_year", String(data.sp_create_year_folder));
          }
          if (localStorage.getItem("sp_create_month") === null && data.sp_create_month_folder !== undefined) {
            setSpCreateMonthFolder(data.sp_create_month_folder);
            localStorage.setItem("sp_create_month", String(data.sp_create_month_folder));
          }
        }
      }
    } catch (e) {
      console.error("Failed to load azure config", e);
    } finally {
      setIsAzureConfigLoaded(true);
    }
  };

  const fetchProviderSettings = async (authToken: string, urlOverride?: string) => {
    try {
      const targetUrl = urlOverride || apiBaseUrl;
      const res = await fetch(`${targetUrl}/settings/providers`, { headers: headers(authToken) });
      if (res.ok) {
        const data = await res.json();
        setProviderSettings(data);
        
        // Dynamically select Groq if it has an active key, otherwise the first provider with a key
        // only on the initial load.
        if (!hasAutoSelectedRef.current) {
          const groqProvider = data.find((p: any) => p.provider_name === "Groq" && p.has_key);
          const activeProvider = groqProvider || data.find((p: any) => p.has_key);
          if (activeProvider) {
            setSelectedProvider(activeProvider.provider_name);
            hasAutoSelectedRef.current = true;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocumentStatus = async (docId: string, authToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/documents/${docId}`, { headers: headers(authToken) });
      if (res.ok) {
        const doc = await res.json();
        setSelectedDoc(prev => (prev && prev.id === docId ? doc : prev));
        if (doc.status === "completed" && (!extractedData || selectedDoc?.status !== "completed")) {
          fetchPreview(docId, authToken);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetches transaction list and automatically triggers Excel download
  const fetchPreview = async (docId: string, authToken: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/documents/${docId}/preview`, { headers: headers(authToken) });
      if (res.ok) {
        const data = await res.json();
        if (data.extracted_data) {
          setExtractedData(data.extracted_data);
        } else {
          setExtractedData({
            bank_name: "",
            account_number: "",
            account_holder: "",
            statement_period: "",
            transactions: []
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Upload: Handles batch files, selects the first file, and auto-triggers AI processing!
  const uploadFiles = async (files: File[]) => {
    if (!files || files.length === 0 || !token) return;
    setUploadProgress(true);
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));

    try {
      const res = await fetch(`${apiBaseUrl}/documents/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      
      if (res.ok) {
        const uploadedDocs = await res.json();
        await fetchDocuments(token);
        
        // Auto-Trigger Processing for the first uploaded file!
        if (uploadedDocs && uploadedDocs.length > 0) {
          const targetDoc = uploadedDocs[0];
          setSelectedDoc(targetDoc);
          setExtractedData(null);
          
          if (targetDoc.status === "completed") {
            // Data is already available, just fetch preview
            fetchPreview(targetDoc.id, token);
          } else {
            // Small timeout to allow state updates to settle, then trigger AI
            setTimeout(() => {
              autoTriggerExtraction(targetDoc.id, selectedProvider);
            }, 600);
          }
        }
      } else {
        const err = await res.json();
        alert(err.detail || "Upload validation failed.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Network Error: Failed to upload file. Check if Python backend is active on port 8000.");
    } finally {
      setUploadProgress(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    uploadFiles(Array.from(e.target.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Auto-trigger AI extraction method (called on upload)
  const autoTriggerExtraction = async (docId: string, provider: string) => {
    setProcessingDocs(prev => ({ ...prev, [docId]: true }));
    try {
      const res = await fetch(`${apiBaseUrl}/extract/`, {
        method: "POST",
        headers: headers(token || "local-session"),
        body: JSON.stringify({
          document_id: docId,
          ai_provider: provider
        })
      });
      if (res.ok) {
        await fetchDocuments(token || "local-session");
        setSelectedDoc(prev => (prev && prev.id === docId ? { ...prev, status: "processing" } : prev));
      }
    } catch (e) {
      console.error("Auto extraction trigger failed", e);
    } finally {
      setProcessingDocs(prev => ({ ...prev, [docId]: false }));
    }
  };

  // Manual Trigger
  const triggerExtraction = async () => {
    if (!selectedDoc || !token) return;
    await autoTriggerExtraction(selectedDoc.id, selectedProvider);
  };

  // Secure Delete
  const handleDeleteDoc = async (docId: string) => {
    if (!token) return;
    if (!confirm("Confirm file shredding? This zero-overwrites the storage cluster partition and is unrecoverable.")) return;

    try {
      const res = await fetch(`${apiBaseUrl}/documents/${docId}`, {
        method: "DELETE",
        headers: headers(token)
      });
      if (res.ok) {
        if (selectedDoc?.id === docId) {
          setSelectedDoc(null);
          setExtractedData(null);
        }
        fetchDocuments(token);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Save Settings
  const handleSaveSetting = async () => {
    if (!editProvider || !token) return;
    try {
      const body: any = {
        provider_name: editProvider.provider_name,
      };
      // Only send fields that the user actually filled in
      if (editApiKey)    body.api_key   = editApiKey;
      if (editBaseUrl)   body.base_url  = editBaseUrl;
      if (editModelName) body.model_name = editModelName;

      const res = await fetch(`${apiBaseUrl}/settings/provider`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body)
      });
      if (res.ok) {
        await fetchProviderSettings(token);
        setSaveSuccess(`${editProvider.provider_name} settings saved.`);
        setTimeout(() => setSaveSuccess(null), 3000);
        setEditProvider(null);
        setEditApiKey("");
        setEditBaseUrl("");
        setEditModelName("");
      } else {
        const err = await res.json();
        alert(`Save failed: ${err.detail || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Network error saving settings.");
    }
  };

  const handleSpSignIn = async (pendingDocId?: string, pendingData?: any) => {
    const currentClientId = spClientId || (azureConfig && azureConfig.client_id);
    const currentTenantId = spTenantId || (azureConfig && azureConfig.tenant_id);
    const currentClientSecret = spClientSecret;
    
    if (!currentClientId) {
      alert("Please enter an Azure Client ID first. Open settings using the cog icon to configure it.");
      setIsSettingsOpen(true);
      setSettingsTab("sharepoint");
      return null;
    }

    if (pendingDocId && pendingData) {
      sessionStorage.setItem("pending_upload_doc_id", pendingDocId);
      sessionStorage.setItem("pending_upload_data", JSON.stringify(pendingData));
    }
    
    setAuthStatus("authenticating");

    const hasSecret = currentClientSecret || (azureConfig && azureConfig.has_secret);

    if (hasSecret) {
      // Manual redirect to Microsoft sign-in to bypass client-side code exchange
      const redirectUri = window.location.origin;
      const authorizeUrl = `https://login.microsoftonline.com/${currentTenantId || 'common'}/oauth2/v2.0/authorize?` + 
        `client_id=${encodeURIComponent(currentClientId)}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_mode=query` +
        `&scope=${encodeURIComponent("Sites.ReadWrite.All Files.ReadWrite.All offline_access")}`;
      
      window.location.href = authorizeUrl;
      return null;
    }

    try {
      const msalInstance = await getMsalInstance(currentClientId, currentTenantId);
      const request = {
        scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"]
      };
      // Redirect login (no popups)
      await msalInstance.loginRedirect(request);
      return null;
    } catch (e: any) {
      console.error("MSAL login error:", e);
      if (e.errorCode === "interaction_in_progress" || e.message?.includes("interaction_in_progress")) {
        console.warn("MSAL interaction already in progress. Clearing status and retrying redirect...");
        clearMsalInteractionStatus();
        try {
          const msalInstance = await getMsalInstance(currentClientId, currentTenantId);
          const request = {
            scopes: ["Sites.ReadWrite.All", "Files.ReadWrite.All"]
          };
          await msalInstance.loginRedirect(request);
          return null;
        } catch (retryErr: any) {
          console.error("Retry MSAL redirect failed:", retryErr);
          alert(`Authentication failed: ${retryErr.message || retryErr}`);
        }
      } else {
        alert(`Authentication failed: ${e.message || e}`);
      }
      setAuthStatus("failed");
      return null;
    }
  };

  const handleSpSignOut = () => {
    setSpToken(null);
    sessionStorage.removeItem("sp_token");
    setAuthStatus(null);
  };

  // Compile and Download Excel file (called automatically)
  const autoExportExcel = async (docId: string, exportData: any, authTokenOverride?: string) => {
    const activeAuthToken = authTokenOverride || token || "local-session";
    if (!exportData || !activeAuthToken) return;
    
    let sharepoint_token = (typeof window !== "undefined" ? sessionStorage.getItem("sp_token") : null) || spToken;
    const currentClientId = spClientId || (azureConfig && azureConfig.client_id);
    const currentTenantId = spTenantId || (azureConfig && azureConfig.tenant_id);
    const currentClientSecret = spClientSecret;

    if (!sharepoint_token) {
      if (currentClientId) {
        sharepoint_token = await handleSpSignIn(docId, exportData);
        if (!sharepoint_token) {
          return;
        }
      } else {
        alert("SharePoint is not configured. Please open settings (cog icon) -> SharePoint & Azure AD tab to set it up.");
        setIsSettingsOpen(true);
        setSettingsTab("sharepoint");
        return;
      }
    }

    const payload = {
      document_id: docId,
      edited_data: exportData,
      sharepoint_token: sharepoint_token || undefined,
      sharepoint_tenant_id: currentTenantId || undefined,
      sharepoint_client_id: currentClientId || undefined,
      sharepoint_client_secret: currentClientSecret || undefined,
      sharepoint_site_url: spSiteUrl || undefined,
      sharepoint_library_name: spLibraryName || undefined,
      sharepoint_base_folder: spBaseFolder || undefined,
      sharepoint_create_year_folder: spCreateYearFolder,
      sharepoint_create_month_folder: spCreateMonthFolder
    };

    setIsUploadingToSp(true);
    try {
      const res = await fetch(`${apiBaseUrl}/export/`, {
        method: "POST",
        headers: headers(activeAuthToken),
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        const now = new Date();
        const yearSegment = spCreateYearFolder ? `/${now.getFullYear()}` : "";
        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        const monthSegment = spCreateMonthFolder ? `/${monthNames[now.getMonth()]}` : "";
        const computedFolder = `${spBaseFolder}${yearSegment}${monthSegment}`;
        
        setUploadSuccessDetails({
          filename: data.filename || "Workbook.xlsx",
          sharepointUrl: data.sharepoint_url || "",
          siteUrl: spSiteUrl || "",
          libraryName: spLibraryName || "Documents",
          folderPath: computedFolder
        });
      } else {
        const errText = await res.text();
        console.error("Auto export file generation failed:", errText);
        alert(`Failed to generate Excel file: ${errText || res.statusText}`);
      }
    } catch (e: any) {
      console.error("Auto export file generation failed:", e);
      alert(`Network error during Excel export: ${e?.message || "Verify backend status."}`);
    } finally {
      setIsUploadingToSp(false);
    }
  };

  // Manual Export
  const handleExportExcel = async () => {
    if (!selectedDoc || !extractedData) return;
    let finalTxs = extractedData.transactions;
    if (gridRef.current && gridRef.current.api) {
      const rows: Transaction[] = [];
      gridRef.current.api.forEachNode((node: any) => {
        rows.push(node.data);
      });
      finalTxs = rows;
    }
    await autoExportExcel(selectedDoc.id, { ...extractedData, transactions: finalTxs });
  };

  // Add/Remove grid rows
  const handleAddRow = () => {
    if (!extractedData) return;
    const newTx: Transaction = {
      date: new Date().toISOString().split("T")[0],
      description: "Added Item",
      reference: "",
      debit: "",
      credit: "",
      balance: ""
    };
    setExtractedData({
      ...extractedData,
      transactions: [...extractedData.transactions, newTx]
    });
  };

  const handleDeleteSelectedRows = () => {
    if (!gridRef.current || !gridRef.current.api || !extractedData) return;
    const selectedNodes = gridRef.current.api.getSelectedNodes();
    const selectedData = selectedNodes.map((node: any) => node.data);
    const filteredTxs = extractedData.transactions.filter(tx => !selectedData.includes(tx));
    setExtractedData({
      ...extractedData,
      transactions: filteredTxs
    });
  };

  const handleGridCellValueChanged = () => {
    if (!gridRef.current || !gridRef.current.api || !extractedData) return;
    const rows: Transaction[] = [];
    gridRef.current.api.forEachNode((node: any) => {
      rows.push(node.data);
    });
    setExtractedData({
      ...extractedData,
      transactions: rows
    });
  };

  const columnDefs: any[] = [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 48,
      pinned: "left" as const,
      resizable: false,
      sortable: false,
      filter: false,
      headerName: "",
    },
    { headerName: "Date", field: "date", editable: true, sortable: true, filter: true, width: 120 },
    { headerName: "Description", field: "description", editable: true, filter: true, flex: 1, minWidth: 200 },
    { headerName: "Reference", field: "reference", editable: true, filter: true, width: 140 },
    {
      headerName: "Debit ($)", field: "debit", editable: true, width: 120,
      cellStyle: (params: any) => params.value ? { color: "#dc2626", fontWeight: "600" } : {},
      valueFormatter: (params: any) => params.value ? `$${parseFloat(params.value).toFixed(2)}` : "",
    },
    {
      headerName: "Credit ($)", field: "credit", editable: true, width: 120,
      cellStyle: (params: any) => params.value ? { color: "#16a34a", fontWeight: "600" } : {},
      valueFormatter: (params: any) => params.value ? `$${parseFloat(params.value).toFixed(2)}` : "",
    },
    {
      headerName: "Balance ($)", field: "balance", editable: true, width: 130,
      valueFormatter: (params: any) => params.value !== "" && params.value !== null && params.value !== undefined ? `$${parseFloat(params.value).toFixed(2)}` : "",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-blue-100">
      
      {/* Premium Corporate Top Header Bar */}
      <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-sm relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl shadow-md shadow-blue-600/10">
            <FileSpreadsheet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-md font-bold tracking-tight text-slate-900">Local AI Document Hub</h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase">Secured Financial Ledger Parser</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            AU-West Cluster: Online
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">AI Coordinator:</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none transition"
            >
              {providerSettings.map(s => (
                <option key={s.provider_name} value={s.provider_name}>
                  {s.provider_name} {s.model_name ? `(${s.model_name})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition cursor-pointer"
            title="AI Config Settings"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side Menu Panel: Upload & Documents Ledger */}
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-sm">
          
          {/* Sidebar Upload Trigger */}
          <div className="p-4 border-b border-slate-100">
            <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer font-bold text-xs shadow-sm transition active:scale-[0.98]">
              <Plus className="h-4 w-4" />
              <span>Upload PDF</span>
              <input 
                type="file" 
                multiple 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp"
              />
            </label>
            {uploadProgress && (
              <div className="mt-2.5 flex items-center justify-center gap-2 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-1.5 animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Uploading statements...</span>
              </div>
            )}
          </div>

          {/* Ledger Lists */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
              <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
              Statement Archive
            </h2>

            {documents.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-500">No statements uploaded yet</p>
                <p className="text-[10px] text-slate-400 mt-1">Upload a PDF above to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const isProc = doc.status === "processing" || doc.status === "uploaded";
                  
                  return (
                    <div 
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoc(doc);
                        setExtractedData(null);
                        if (doc.status === "completed") {
                          fetchPreview(doc.id, token || "");
                        } else if (doc.status === "uploaded") {
                          autoTriggerExtraction(doc.id, selectedProvider);
                        }
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition relative group flex items-start gap-3 ${
                        isSelected 
                          ? "bg-blue-50/70 border-blue-200 shadow-sm" 
                          : "bg-white border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`p-1.5 border rounded-lg mt-0.5 ${isSelected ? 'bg-blue-100 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                        <FileText className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-xs font-bold text-slate-900 truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {isProc ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-semibold flex items-center gap-1 shrink-0">
                              <RefreshCw className="h-2 w-2 animate-spin" />
                              Parsing
                            </span>
                          ) : doc.status === "completed" ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold shrink-0">
                              Success
                            </span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 font-semibold shrink-0">
                              Failed
                            </span>
                          )}
                          <span className="text-[9px] text-slate-400 font-medium truncate">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {(doc.ocr_engine || doc.ai_provider) && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {doc.ocr_engine && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                                OCR: {doc.ocr_engine}
                              </span>
                            )}
                            {doc.ai_provider && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">
                                AI: {doc.ai_provider}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDoc(doc.id);
                        }}
                        className="absolute right-2 top-3 p-1.5 bg-slate-50 hover:bg-red-50 border border-slate-100 hover:border-red-200 text-slate-400 hover:text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Secure Shred"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Spreadsheet Editor Frame */}
        <section className="flex-1 bg-slate-50 flex flex-col overflow-hidden p-6 gap-6">
          {selectedDoc ? (
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col overflow-hidden">
              
              {/* Extract toolbar */}
              <div className="h-14 border-b border-slate-150/80 px-6 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 truncate max-w-xs">{selectedDoc.filename}</span>
                  {selectedDoc.status === "processing" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-semibold flex items-center gap-1">
                      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                      Parsing...
                    </span>
                  )}
                  {selectedDoc.status === "completed" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-250 text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                      Ready
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {extractedData && (
                    <button
                      onClick={handleExportExcel}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer shadow-emerald-500/10"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload to SharePoint
                    </button>
                  )}
                </div>
              </div>

              {/* Dynamic Metadata Fields */}
              <div className="p-5 border-b border-slate-100 shrink-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Institution Bank</label>
                    <input 
                      type="text" 
                      value={extractedData?.bank_name || ""} 
                      onChange={(e) => setExtractedData(prev => prev ? { ...prev, bank_name: e.target.value } : null)}
                      placeholder="e.g. Westpac Bank"
                      className="mt-1.5 w-full bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Account BSB/Number</label>
                    <input 
                      type="text" 
                      value={extractedData?.account_number || ""} 
                      onChange={(e) => setExtractedData(prev => prev ? { ...prev, account_number: e.target.value } : null)}
                      placeholder="e.g. 062-900 123456"
                      className="mt-1.5 w-full bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Corporate Owner</label>
                    <input 
                      type="text" 
                      value={extractedData?.account_holder || ""} 
                      onChange={(e) => setExtractedData(prev => prev ? { ...prev, account_holder: e.target.value } : null)}
                      placeholder="e.g. Acme Holdings Pty Ltd"
                      className="mt-1.5 w-full bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Filing Period</label>
                    <input 
                      type="text" 
                      value={extractedData?.statement_period || ""} 
                      onChange={(e) => setExtractedData(prev => prev ? { ...prev, statement_period: e.target.value } : null)}
                      placeholder="e.g. 01 Jul - 31 Jul 2024"
                      className="mt-1.5 w-full bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* AG Grid Spreadsheet Container */}
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {extractedData && extractedData.transactions && extractedData.transactions.length > 0 ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {/* Re-running Banner */}
                    {selectedDoc.status === "processing" && (
                      <div className="px-5 py-2 bg-blue-50/70 border-b border-blue-100/80 text-blue-700 text-[11px] font-semibold flex items-center gap-2 shrink-0 animate-pulse">
                        <RefreshCw className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                        <span>Re-running AI convert in background... New transactions will load once complete.</span>
                      </div>
                    )}

                    {/* Failed Re-run Banner */}
                    {selectedDoc.status === "failed" && (
                      <div className="px-5 py-2 bg-rose-50 border-b border-rose-100 text-rose-700 text-[11px] font-semibold flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span className="truncate pr-4">
                            <strong>Last re-run failed:</strong> {selectedDoc.error_message || "Verify provider settings."}
                          </span>
                        </div>
                        <span className="text-[8px] bg-rose-100 px-2 py-0.5 rounded text-rose-800 font-bold uppercase tracking-wider shrink-0">Showing Previous Success</span>
                      </div>
                    )}

                    {/* Stats Summary Bar */}
                    {extractedData && extractedData.transactions.length > 0 && (() => {
                      const cleanNum = (v: any) => parseFloat(String(v).replace(/[$,]/g, "")) || 0;
                      const totalDebits  = extractedData.transactions.reduce((s, t) => s + cleanNum(t.debit), 0);
                      const totalCredits = extractedData.transactions.reduce((s, t) => s + cleanNum(t.credit), 0);
                      const net = totalCredits - totalDebits;
                      const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      return (
                        <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-6 shrink-0 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400 font-semibold">Transactions:</span>
                            <span className="font-bold text-slate-900">{extractedData.transactions.length}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200" />
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400 font-semibold">Total Debits:</span>
                            <span className="font-bold text-red-600">{fmt(totalDebits)}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200" />
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400 font-semibold">Total Credits:</span>
                            <span className="font-bold text-emerald-600">{fmt(totalCredits)}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200" />
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400 font-semibold">Net Flow:</span>
                            <span className={`font-bold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {net >= 0 ? "+" : "-"}{fmt(net)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Grid Options Bar */}
                    <div className="h-10 bg-slate-50/50 border-b border-slate-100 px-4 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleAddRow}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-350 text-slate-600 hover:text-slate-900 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          Add Ledger Entry
                        </button>
                        <button
                          onClick={handleDeleteSelectedRows}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-650 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete Selected
                        </button>
                      </div>

                      {/* Integrity score */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Integrity Audit:</span>
                        {reconciliationScore.status === "PASSED" ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-250 text-emerald-700 font-bold text-[10px] flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            Balanced
                          </span>
                        ) : reconciliationScore.status === "FAILED" ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 font-bold text-[10px] flex items-center gap-1 cursor-help" title={reconciliationScore.text}>
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            Audit Discrepancy Found
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 font-bold text-[10px]">
                            {reconciliationScore.text}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ag-theme-alpine Light grid */}
                    <div className="flex-1 ag-theme-alpine w-full min-h-0" style={{ height: "100%" }}>
  <AgGridProvider modules={[AllCommunityModule]}>
    <AgGridReact
      ref={gridRef}
      rowData={extractedData.transactions}
      columnDefs={columnDefs}
      onCellValueChanged={handleGridCellValueChanged}
      animateRows={true}
      gridOptions={{
        rowSelection: { mode: "multiRow", checkboxes: true, headerCheckbox: true },
        defaultColDef: {
          resizable: true,
          minWidth: 80,
        },
      }}
    />
  </AgGridProvider>
</div>
                  </div>
                ) : selectedDoc.status === "processing" ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-6">
                    <RefreshCw className="h-10 w-10 text-blue-600 animate-spin" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Running AI Conversion Engine...</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        The AI is reading your bank statement and extracting all transactions. This takes 30–120 seconds depending on the model.
                      </p>
                    </div>
                    <div className="w-full max-w-xs space-y-2 mx-auto flex flex-col items-start pl-8">
                      {["OCR / Text Extract", "Layout Analysis", "AI Transaction Parse", "Structured Output"].map((step, i) => (
                        <div key={step} className="flex items-center gap-3 text-xs">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${i === 0 ? "bg-blue-500 animate-pulse" : "bg-slate-200"}`} />
                          <span className={i === 0 ? "text-slate-800 font-semibold" : "text-slate-400"}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedDoc.status === "failed" ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                    <h3 className="text-sm font-bold text-slate-900">Extraction Unsuccessful</h3>
                    <p className="text-xs text-slate-500 mt-2 max-w-md p-3 bg-red-50 border border-red-100 rounded-lg text-left break-all font-mono">
                      {selectedDoc.error_message || "An exception was raised while building local LLM contextual data. Verify model setup."}
                    </p>
                    <button
                      onClick={triggerExtraction}
                      className="mt-6 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Retry Parse
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/20">
                    <RefreshCw className="h-8 w-8 text-slate-300 mb-3 animate-spin" />
                    <h3 className="text-sm font-bold text-slate-700">Loading document data...</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Retrieving parsed ledger transaction data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col items-center justify-center p-12">
              <label 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full max-w-xl border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 relative group ${
                  isDragging 
                    ? "border-blue-500 bg-blue-50/30 scale-[1.01] shadow-lg shadow-blue-500/5" 
                    : "border-slate-200 hover:border-emerald-500 hover:bg-slate-50/50 hover:shadow-md hover:shadow-slate-100"
                }`}
              >
                <div className={`p-4.5 rounded-2xl mb-6 transition-all duration-200 ${
                  isDragging 
                    ? "bg-blue-600 text-white scale-110" 
                    : "bg-emerald-50 text-emerald-600 group-hover:scale-105 group-hover:bg-emerald-100"
                }`}>
                  <Upload className="h-8 w-8" />
                </div>

                <h3 className="text-md font-bold text-slate-900 tracking-tight">Upload a PDF to convert</h3>
                <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
                  Drag and drop a PDF here, or click below. We'll extract its tables into a clean, downloadable Excel file.
                </p>

                <div className="mt-8">
                  <span className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/10 transition group-hover:scale-[1.02]">
                    <Upload className="h-4 w-4" />
                    Select PDF
                  </span>
                </div>

                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-6">
                  PDF files up to 20 MB
                </p>

                <input 
                  type="file" 
                  multiple 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp"
                />
              </label>

              {/* Automation active alert */}
              <div className="mt-8 flex items-center gap-2.5 text-xs bg-slate-50 border border-slate-200/80 text-slate-500 rounded-xl px-4 py-2.5 max-w-md">
                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                <span><strong>Automation active:</strong> Dropping a file will automatically run the conversion and download your Excel sheet.</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Slide-out Settings Drawer */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
          <div className="w-96 bg-white h-full p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Settings Configuration</h2>
              </div>
              <button 
                onClick={() => {
                  setIsSettingsOpen(false);
                  setEditProvider(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex border-b border-slate-100 mb-4 text-xs font-semibold shrink-0">
              <button
                onClick={() => setSettingsTab("ai")}
                className={`flex-1 pb-2 border-b-2 text-center transition cursor-pointer ${
                  settingsTab === "ai" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-slate-400 hover:text-slate-650"
                }`}
              >
                AI Providers
              </button>
              <button
                onClick={() => setSettingsTab("sharepoint")}
                className={`flex-1 pb-2 border-b-2 text-center transition cursor-pointer ${
                  settingsTab === "sharepoint" ? "border-blue-600 text-blue-600 font-bold" : "border-transparent text-slate-400 hover:text-slate-655"
                }`}
              >
                SharePoint & Azure AD
              </button>
            </div>

            {saveSuccess && (
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                {saveSuccess}
              </div>
            )}

            {/* Config Panel Content Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {settingsTab === "ai" ? (
                editProvider ? (
                  // Editing view
                  <div className="space-y-4 bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Configure {editProvider.provider_name}</h3>
                    
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Model Name</label>
                      <input 
                        type="text" 
                        value={editModelName} 
                        onChange={(e) => setEditModelName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        placeholder={
                          editProvider.provider_name === "Ollama" ? "e.g. qwen2.5:7b" :
                          editProvider.provider_name === "LMStudio" ? "e.g. qwen" :
                          editProvider.provider_name === "OpenAI" ? "e.g. gpt-4o-mini" :
                          editProvider.provider_name === "Claude" ? "e.g. claude-3-5-sonnet-20241022" :
                          editProvider.provider_name === "Gemini" ? "e.g. gemini-1.5-flash" :
                          editProvider.provider_name === "OpenRouter" ? "e.g. google/gemini-2.5-flash" :
                          editProvider.provider_name === "Groq" ? "e.g. llama-3.3-70b-versatile" :
                          "e.g. model-name"
                        }
                      />
                    </div>

                    {(editProvider.provider_name === "Ollama" || editProvider.provider_name === "LMStudio") && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Base Port URL (optional)</label>
                        <input 
                          type="text" 
                          value={editBaseUrl} 
                          onChange={(e) => setEditBaseUrl(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                          placeholder="e.g. http://localhost:11434"
                        />
                      </div>
                    )}

                    {editProvider.provider_name !== "Ollama" && editProvider.provider_name !== "LMStudio" && (
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">API Key</label>
                        <input 
                          type="password" 
                          value={editApiKey} 
                          onChange={(e) => setEditApiKey(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                          placeholder={editProvider.has_key ? "•••••••• (Key Configured)" : "Paste API Key"}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={handleSaveSetting}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs transition cursor-pointer"
                      >
                        Save Config
                      </button>
                      <button 
                        onClick={() => setEditProvider(null)}
                        className="px-3 bg-slate-200 hover:bg-slate-350 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        if (!editProvider) return;
                        const res = await fetch(`${apiBaseUrl}/settings/provider/test`, {
                          method: "POST",
                          headers: headers(token || "local-session"),
                          body: JSON.stringify({ provider_name: editProvider.provider_name })
                        });
                        const result = await res.json();
                        alert(result.status === "ok" ? `✅ ${result.message}` : `❌ ${result.message}`);
                      }}
                      className="w-full mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      Test Connection
                    </button>
                  </div>
                ) : (
                  // Provider List
                  <div className="space-y-2.5">
                    {providerSettings.map((provider) => {
                      const isLocal = provider.provider_name === "Ollama" || provider.provider_name === "LMStudio";
                      
                      return (
                        <div 
                          key={provider.provider_name}
                          onClick={() => {
                            setEditProvider(provider);
                            setEditModelName(provider.model_name || "");
                            setEditBaseUrl(provider.base_url || "");
                            setEditApiKey("");
                          }}
                          className="p-3.5 bg-slate-50 hover:bg-slate-100/60 border border-slate-200 rounded-2xl text-left cursor-pointer transition flex items-center justify-between group"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition">{provider.provider_name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-56">
                              Target: {provider.model_name || "default"}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isLocal ? (
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">
                                Local Node
                              </span>
                            ) : provider.has_key ? (
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center gap-1">
                                <Key className="h-2.5 w-2.5" /> Key Saved
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-full">
                                No Key
                              </span>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                // SharePoint Configuration Tab
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">SharePoint & Azure AD Config</h3>
                  
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Azure AD Tenant ID</label>
                    <input 
                      type="text" 
                      value={spTenantId} 
                      onChange={(e) => {
                        setSpTenantId(e.target.value);
                        localStorage.setItem("sp_tenant_id", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="e.g. 78dbd154-b480-45f3-abe3-186656cd2119"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Azure AD Client ID (App ID)</label>
                    <input 
                      type="text" 
                      value={spClientId} 
                      onChange={(e) => {
                        setSpClientId(e.target.value);
                        localStorage.setItem("sp_client_id", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="e.g. 1fcf03d0-98cf-484b-a765-f8f6581ff6a8"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Azure AD Client Secret (Web Client fallback)</label>
                    <input 
                      type="password" 
                      value={spClientSecret} 
                      onChange={(e) => {
                        setSpClientSecret(e.target.value);
                        localStorage.setItem("sp_client_secret", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="Enter Client Secret"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">SharePoint Site URL</label>
                    <input 
                      type="text" 
                      value={spSiteUrl} 
                      onChange={(e) => {
                        setSpSiteUrl(e.target.value);
                        localStorage.setItem("sp_site_url", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="https://tenant.sharepoint.com/sites/SiteName"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Document Library Name</label>
                    <input 
                      type="text" 
                      value={spLibraryName} 
                      onChange={(e) => {
                        setSpLibraryName(e.target.value);
                        localStorage.setItem("sp_library_name", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="e.g. Documents"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Base Folder</label>
                    <input 
                      type="text" 
                      value={spBaseFolder} 
                      onChange={(e) => {
                        setSpBaseFolder(e.target.value);
                        localStorage.setItem("sp_base_folder", e.target.value);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                      placeholder="e.g. ProcessedDocuments"
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={spCreateYearFolder} 
                        onChange={(e) => {
                          setSpCreateYearFolder(e.target.checked);
                          localStorage.setItem("sp_create_year", String(e.target.checked));
                        }}
                        className="rounded border-slate-350 text-blue-650 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Create Year Folder structure</span>
                    </label>
                    
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={spCreateMonthFolder} 
                        onChange={(e) => {
                          setSpCreateMonthFolder(e.target.checked);
                          localStorage.setItem("sp_create_month", String(e.target.checked));
                        }}
                        className="rounded border-slate-355 text-blue-655 focus:ring-blue-500 h-4 w-4"
                      />
                      <span>Create Month Folder structure</span>
                    </label>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Authentication Status</h4>
                    {spToken ? (
                      <div className="space-y-2.5">
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between text-xs text-emerald-850">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="font-bold">Active Token Loaded</span>
                          </div>
                          <button
                            onClick={handleSpSignOut}
                            className="text-[10px] bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg text-red-600 font-bold transition cursor-pointer"
                          >
                            Sign Out
                          </button>
                        </div>
                        <div className="text-[9px] text-slate-400 break-all font-mono line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100">
                          {spToken}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-xs text-rose-800">
                          <span className="h-2 w-2 rounded-full bg-rose-500" />
                          <span className="font-semibold">Not Authenticated</span>
                        </div>
                        <button
                          onClick={() => handleSpSignIn()}
                          disabled={authStatus === "authenticating"}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl cursor-pointer font-bold text-xs shadow-sm transition active:scale-[0.98]"
                        >
                          {authStatus === "authenticating" ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Acquiring Token...</span>
                            </>
                          ) : (
                            <>
                              <Key className="h-3.5 w-3.5" />
                              <span>Sign In to Microsoft</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4 mt-6 text-center text-[9px] font-semibold text-slate-400 uppercase flex items-center justify-center gap-1.5">
              <Lock className="h-3 w-3 text-slate-400" />
              AES-GCM SQLite Key Protection Enabled
            </div>

          </div>
        </div>
      )}

      {/* Upload Success Premium Dialog Modal */}
      {uploadSuccessDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-150 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex flex-col items-center text-center">
              <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600 mb-5 relative">
                <span className="absolute inset-0 rounded-2xl bg-emerald-500/10 animate-ping" />
                <FileCheck2 className="h-10 w-10 relative z-10" />
              </div>
              
              <h3 className="text-md font-bold text-slate-900 tracking-tight">Excel Uploaded Successfully</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">
                Your statement spreadsheet has been compiled and stored inside your SharePoint repository.
              </p>
            </div>

            <div className="mt-6 bg-slate-50 border border-slate-200/85 rounded-2xl p-5 space-y-4 text-left">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Filename</span>
                <span className="text-xs font-semibold text-slate-800 break-all">{uploadSuccessDetails.filename}</span>
              </div>

              <div className="h-px bg-slate-200/60" />

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">SharePoint URL</span>
                <span className="text-xs font-semibold text-slate-800 break-all">{uploadSuccessDetails.siteUrl}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Library</span>
                  <span className="text-xs font-semibold text-slate-800 truncate block">{uploadSuccessDetails.libraryName}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Folder Path</span>
                  <span className="text-xs font-semibold text-slate-800 break-all">{uploadSuccessDetails.folderPath}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              {uploadSuccessDetails.sharepointUrl && (
                <a
                  href={uploadSuccessDetails.sharepointUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-500/10 transition active:scale-[0.98] cursor-pointer"
                >
                  <span>Open File</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={() => setUploadSuccessDetails(null)}
                className="px-5 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition active:scale-[0.98] cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SharePoint Upload Loading Overlay */}
      {isUploadingToSp && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center">
            <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
            <h3 className="text-sm font-bold text-slate-900">Uploading to SharePoint</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              Please wait while we compile the ledger sheet and transmit it to your SharePoint library...
            </p>
          </div>
        </div>
      )}

    </main>
  );
}
