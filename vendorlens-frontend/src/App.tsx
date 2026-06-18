import { useState, useRef } from 'react'
import axios from 'axios'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [report, setReport] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please select an Excel file first.")
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setReport(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post('http://localhost:8000/api/v1/vendor/intake', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      setResult(response.data)
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.detail || err.message || 'An error occurred during upload')
    } finally {
      setLoading(false)
    }
  }

  const handleScan = async () => {
    if (!result || !result.input_id) return

    setScanning(true)
    setError('')
    setReport(null)

    try {
      const response = await axios.post(`http://localhost:8000/api/v1/scan/${result.input_id}`)
      setReport(response.data)
    } catch (err: any) {
      console.error(err)
      setError(err.response?.data?.detail || err.message || 'An error occurred during scanning')
    } finally {
      setScanning(false)
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier?.toUpperCase()) {
      case 'CRITICAL': return 'bg-red-600 text-white'
      case 'HIGH': return 'bg-orange-500 text-white'
      case 'MEDIUM': return 'bg-yellow-400 text-black'
      case 'LOW': return 'bg-green-500 text-white'
      default: return 'bg-gray-300 text-black'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-8">
        
        <div className="bg-white p-8 rounded-lg shadow-md border-t-4 border-blue-600">
          <div>
            <h2 className="text-center text-3xl font-extrabold text-gray-900">
              VendorLens Prototype
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Upload Vendor Intake Excel Sheet
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleUpload}>
            <div className="rounded-md shadow-sm space-y-4">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 p-6 rounded-md hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none"
                >
                  Select Excel File
                </button>
                {file && (
                  <p className="mt-2 text-sm text-gray-700 font-medium">Selected: {file.name}</p>
                )}
                {!file && (
                  <p className="mt-2 text-xs text-gray-500">Only .xlsx files supported</p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !file}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
              >
                {loading ? 'Uploading...' : 'Upload & Save Vendor'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {result && !report && (
            <div className="mt-6 bg-blue-50 border border-blue-200 p-6 rounded-lg flex flex-col items-center">
              <h3 className="text-lg font-medium text-blue-900 mb-2">Vendor Data Saved Successfully</h3>
              <p className="text-sm text-blue-700 mb-4 text-center">
                <strong>{result.legal_name}</strong> has been registered. You can now run the due diligence scan.
              </p>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm disabled:bg-indigo-300"
              >
                {scanning ? 'Running Automated Scan (30-60s)...' : 'Run Full Risk Scan'}
              </button>
            </div>
          )}
        </div>

        {/* RISK REPORT DASHBOARD */}
        {report && (
          <div className="bg-white p-8 rounded-lg shadow-lg border border-gray-200">
            <div className="flex justify-between items-start border-b pb-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Due Diligence Report</h2>
                <p className="text-sm text-gray-500 mt-1">ID: {report.report_id}</p>
              </div>
              <div className={`px-4 py-2 rounded-md font-bold text-lg tracking-wider ${getTierColor(report.overall_risk_tier)}`}>
                {report.overall_risk_tier} RISK
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <p className="text-sm text-gray-500 uppercase font-semibold">Risk Score</p>
                <p className="text-3xl font-bold text-gray-900">{report.risk_score} <span className="text-base font-normal text-gray-500">/ 100</span></p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border col-span-2">
                <p className="text-sm text-gray-500 uppercase font-semibold">Executive Summary</p>
                <p className="text-gray-900 font-medium mt-1">{report.summary}</p>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Recommendations</h3>
              <p className="text-gray-700 bg-blue-50 p-4 rounded-lg border border-blue-100">{report.recommendations}</p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4 flex items-center justify-between">
                Adverse Findings
                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">{report.findings?.length || 0} items</span>
              </h3>
              
              {(!report.findings || report.findings.length === 0) ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <p className="text-gray-500">No adverse findings detected in public data sources.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {report.findings.map((finding: any, idx: number) => (
                    <div key={idx} className="border rounded-lg overflow-hidden">
                      <div className={`px-4 py-2 flex justify-between items-center ${
                        finding.severity === 'critical' ? 'bg-red-100 border-b border-red-200' :
                        finding.severity === 'high' ? 'bg-orange-100 border-b border-orange-200' :
                        finding.severity === 'medium' ? 'bg-yellow-100 border-b border-yellow-200' :
                        'bg-gray-100 border-b border-gray-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                            finding.severity === 'critical' ? 'bg-red-600 text-white' :
                            finding.severity === 'high' ? 'bg-orange-500 text-white' :
                            finding.severity === 'medium' ? 'bg-yellow-400 text-black' :
                            'bg-gray-300 text-black'
                          }`}>
                            {finding.severity}
                          </span>
                          <span className="font-semibold text-gray-900">{finding.title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs bg-white border px-2 py-1 rounded text-gray-600 font-mono">
                            src: {finding.source_api}
                          </span>
                          <span className="text-xs text-gray-500">
                            conf: {(finding.confidence_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <p className="text-sm text-gray-700">{finding.description}</p>
                        <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">Type: {finding.finding_type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
