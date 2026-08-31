import React, { useState } from 'react';
import {
  Code2,
  Key,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Layers,
  Zap,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resellerService } from '../../services/reseller';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';

export const ApiDocsPage: React.FC = () => {
  const { user, refreshUserProfile } = useAuth();

  const [activeAction, setActiveAction] = useState<'services' | 'add' | 'status' | 'balance'>('services');
  const [activeLang, setActiveLang] = useState<'curl' | 'python' | 'php' | 'node'>('curl');

  const [localKey, setLocalKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showKey, setShowKey] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const apiKey = localKey || user?.api_key || '';
  const apiEndpoint = 'http://localhost:8000/api/v2';

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setSuccessMessage(null);
    try {
      const updatedUser = await resellerService.generateApiKey();
      if (updatedUser?.api_key) {
        setLocalKey(updatedUser.api_key);
      }
      await refreshUserProfile();
      setShowKey(true);
      setSuccessMessage('🎉 New Reseller API Key generated and activated successfully!');
    } catch (err: any) {
      console.error(err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyApiKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyCodeSnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  // Generate dynamic code snippets
  const getCodeSnippet = () => {
    const keyVal = apiKey || 'YOUR_API_KEY_HERE';

    if (activeAction === 'services') {
      if (activeLang === 'curl') {
        return `curl -X POST "${apiEndpoint}" \\
  -d "key=${keyVal}" \\
  -d "action=services"`;
      } else if (activeLang === 'python') {
        return `import requests

url = "${apiEndpoint}"
payload = {
    "key": "${keyVal}",
    "action": "services"
}
response = requests.post(url, data=payload)
print(response.json())`;
      } else if (activeLang === 'php') {
        return `<?php
$ch = curl_init("${apiEndpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'key' => '${keyVal}',
    'action' => 'services'
]));
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));
?>`;
      } else {
        return `const axios = require('axios');

axios.post('${apiEndpoint}', new URLSearchParams({
  key: '${keyVal}',
  action: 'services'
}))
.then(res => console.log(res.data))
.catch(err => console.error(err));`;
      }
    } else if (activeAction === 'add') {
      if (activeLang === 'curl') {
        return `curl -X POST "${apiEndpoint}" \\
  -d "key=${keyVal}" \\
  -d "action=add" \\
  -d "service=SERVICE_ID" \\
  -d "link=https://instagram.com/p/your_post" \\
  -d "quantity=1000"`;
      } else if (activeLang === 'python') {
        return `import requests

url = "${apiEndpoint}"
payload = {
    "key": "${keyVal}",
    "action": "add",
    "service": "SERVICE_ID",
    "link": "https://instagram.com/p/your_post",
    "quantity": 1000
}
response = requests.post(url, data=payload)
print(response.json())`;
      } else if (activeLang === 'php') {
        return `<?php
$ch = curl_init("${apiEndpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'key' => '${keyVal}',
    'action' => 'add',
    'service' => 'SERVICE_ID',
    'link' => 'https://instagram.com/p/your_post',
    'quantity' => 1000
]));
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));
?>`;
      } else {
        return `const axios = require('axios');

axios.post('${apiEndpoint}', new URLSearchParams({
  key: '${keyVal}',
  action: 'add',
  service: 'SERVICE_ID',
  link: 'https://instagram.com/p/your_post',
  quantity: 1000
}))
.then(res => console.log(res.data))
.catch(err => console.error(err));`;
      }
    } else if (activeAction === 'status') {
      if (activeLang === 'curl') {
        return `curl -X POST "${apiEndpoint}" \\
  -d "key=${keyVal}" \\
  -d "action=status" \\
  -d "order=ORDER_ID"`;
      } else if (activeLang === 'python') {
        return `import requests

url = "${apiEndpoint}"
payload = {
    "key": "${keyVal}",
    "action": "status",
    "order": "ORDER_ID"
}
response = requests.post(url, data=payload)
print(response.json())`;
      } else if (activeLang === 'php') {
        return `<?php
$ch = curl_init("${apiEndpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'key' => '${keyVal}',
    'action' => 'status',
    'order' => 'ORDER_ID'
]));
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));
?>`;
      } else {
        return `const axios = require('axios');

axios.post('${apiEndpoint}', new URLSearchParams({
  key: '${keyVal}',
  action: 'status',
  order: 'ORDER_ID'
}))
.then(res => console.log(res.data))
.catch(err => console.error(err));`;
      }
    } else {
      // Balance
      if (activeLang === 'curl') {
        return `curl -X POST "${apiEndpoint}" \\
  -d "key=${keyVal}" \\
  -d "action=balance"`;
      } else if (activeLang === 'python') {
        return `import requests

url = "${apiEndpoint}"
payload = {
    "key": "${keyVal}",
    "action": "balance"
}
response = requests.post(url, data=payload)
print(response.json())`;
      } else if (activeLang === 'php') {
        return `<?php
$ch = curl_init("${apiEndpoint}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'key' => '${keyVal}',
    'action' => 'balance'
]));
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));
?>`;
      } else {
        return `const axios = require('axios');

axios.post('${apiEndpoint}', new URLSearchParams({
  key: '${keyVal}',
  action: 'balance'
}))
.then(res => console.log(res.data))
.catch(err => console.error(err));`;
      }
    }
  };

  const getSampleResponse = () => {
    if (activeAction === 'services') {
      return `[
  {
    "service": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "name": "Instagram Real Followers [Instant | Non-Drop]",
    "type": "Default",
    "category": "Instagram Followers",
    "rate": "120.00",
    "min": "50",
    "max": "50000",
    "refill": true,
    "cancel": true
  }
]`;
    } else if (activeAction === 'add') {
      return `{
  "order": "e3f1c24a-78b1-4b11-9a7c-0a2b4c6e8d10"
}`;
    } else if (activeAction === 'status') {
      return `{
  "charge": "120.00",
  "start_count": "1420",
  "status": "In progress",
  "remains": "250",
  "currency": "KES"
}`;
    } else {
      return `{
  "balance": "14500.00",
  "currency": "KES"
}`;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
              API v2 Protocol
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Reseller API Documentation</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Connect your SMM panel, custom software, Telegram bots, or automation scripts to SocialPulse
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* API Key Credentials Card */}
      <Card
        title="Your Reseller API Key"
        subtitle="Authenticate all your automated requests with this secret key"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800">
              <Key className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey || 'Click Generate API Key button on the right to create your key'}
                readOnly
                className={`bg-transparent text-xs font-mono flex-1 focus:outline-none select-all ${
                  apiKey ? 'text-emerald-400 font-bold' : 'text-slate-500'
                }`}
              />
              {apiKey && (
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-slate-400 hover:text-white text-xs px-1.5 flex items-center gap-1"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showKey ? 'Hide' : 'Reveal'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {apiKey && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={copyApiKey}
                  leftIcon={copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                >
                  {copiedKey ? 'Copied!' : 'Copy Key'}
                </Button>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerateKey}
                isLoading={generatingKey}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                {apiKey ? 'Regenerate API Key' : 'Generate API Key'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              Standard HTTP POST endpoint: <strong className="font-mono text-white">{apiEndpoint}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* API Action Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {(
          [
            { id: 'services', label: '1. Service List (services)' },
            { id: 'add', label: '2. Create Order (add)' },
            { id: 'status', label: '3. Order Status (status)' },
            { id: 'balance', label: '4. User Balance (balance)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveAction(tab.id)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeAction === tab.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Parameters & Code Samples Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parameters Spec */}
        <Card
          title={`Action: ${activeAction.toUpperCase()}`}
          subtitle={`Parameters required for action=${activeAction}`}
        >
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Parameter</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                <tr>
                  <td className="py-2.5 px-3 text-blue-400 font-bold">key</td>
                  <td className="py-2.5 px-3 text-slate-500">string</td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">Your unique API key</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 text-blue-400 font-bold">action</td>
                  <td className="py-2.5 px-3 text-slate-500">string</td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">Must be "{activeAction}"</td>
                </tr>

                {activeAction === 'add' && (
                  <>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">service</td>
                      <td className="py-2.5 px-3 text-slate-500">string</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Service ID to order</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">link</td>
                      <td className="py-2.5 px-3 text-slate-500">string</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Target profile/post link</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">quantity</td>
                      <td className="py-2.5 px-3 text-slate-500">integer</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Number of units requested</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-400">comments</td>
                      <td className="py-2.5 px-3 text-slate-500">string</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Optional custom comments (\\n separated)</td>
                    </tr>
                  </>
                )}

                {activeAction === 'status' && (
                  <>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">order</td>
                      <td className="py-2.5 px-3 text-slate-500">string</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Single order ID</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-400">orders</td>
                      <td className="py-2.5 px-3 text-slate-500">string</td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">Multiple order IDs separated by commas</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Sample JSON Response */}
          <div className="mt-6">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Example JSON Response
            </span>
            <div className="p-3.5 rounded-xl bg-slate-950 font-mono text-xs text-emerald-400 overflow-x-auto border border-slate-800">
              <pre>{getSampleResponse()}</pre>
            </div>
          </div>
        </Card>

        {/* Code Snippets */}
        <Card title="Interactive Code Snippet" subtitle="Copy ready-to-use code in your favorite language">
          {/* Language Selector */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(['curl', 'python', 'php', 'node'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                    activeLang === lang ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang === 'node' ? 'Node.js' : lang}
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => copyCodeSnippet(getCodeSnippet())}
              leftIcon={copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedSnippet ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto border border-slate-800/80">
            <pre>{getCodeSnippet()}</pre>
          </div>
        </Card>
      </div>
    </div>
  );
};
