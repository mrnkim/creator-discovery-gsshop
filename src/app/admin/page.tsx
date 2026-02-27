"use client";

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import { VideoData } from '@/types';

type AdminVideo = {
  _id: string;
  hls?: { video_url?: string; thumbnail_urls?: string[] };
  system_metadata?: { filename?: string; video_title?: string; duration?: number };
  index_id: string;
  user_metadata?: Record<string, unknown>;
};

export default function AdminPage() {
  const [analyzingVideoId, setAnalyzingVideoId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [filter, setFilter] = useState<'all' | 'brand' | 'ppl' | 'creator'>('all');
  const [search, setSearch] = useState('');
  const [brandEdits, setBrandEdits] = useState<Record<string, string>>({});
  const [savingBrandId, setSavingBrandId] = useState<string | null>(null);
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState<Record<string, string>>({});
  const [savingMetaId, setSavingMetaId] = useState<string | null>(null);

  const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID || '';
  const brandPplIndexId = process.env.NEXT_PUBLIC_BRAND_PPL_INDEX_ID || '';
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID || '';

  // Fetch videos from all indices
  useEffect(() => {
    const fetchAll = async () => {
      if (!brandIndexId && !brandPplIndexId && !creatorIndexId) return;
      setIsLoading(true);
      setMessage(null);
      try {
        const [brandRes, pplRes, creatorRes] = await Promise.all([
          brandIndexId ? axios.get('/api/videos', { params: { index_id: brandIndexId, limit: 50, page: 1 } }) : Promise.resolve({ data: { data: [] as VideoData[] } }),
          brandPplIndexId ? axios.get('/api/videos', { params: { index_id: brandPplIndexId, limit: 50, page: 1 } }) : Promise.resolve({ data: { data: [] as VideoData[] } }),
          creatorIndexId ? axios.get('/api/videos', { params: { index_id: creatorIndexId, limit: 50, page: 1 } }) : Promise.resolve({ data: { data: [] as VideoData[] } }),
        ]);

        const toAdmin = (data: VideoData[], indexId: string): AdminVideo[] =>
          (data || []).map((v: VideoData) => ({
            _id: v._id,
            hls: v.hls,
            system_metadata: v.system_metadata,
            index_id: indexId,
            user_metadata: v.user_metadata as unknown as Record<string, unknown>,
          }));

        const bItems = toAdmin(brandRes.data?.data as VideoData[], brandIndexId);
        const pItems = toAdmin(pplRes.data?.data as VideoData[], brandPplIndexId);
        const cItems = toAdmin(creatorRes.data?.data as VideoData[], creatorIndexId);
        setVideos([...bItems, ...pItems, ...cItems]);
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : 'Failed to fetch videos');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [brandIndexId, brandPplIndexId, creatorIndexId]);

  const filteredVideos = useMemo(() => {
    return videos
      .filter(v => {
        if (filter === 'brand' && v.index_id !== brandIndexId) return false;
        if (filter === 'ppl' && v.index_id !== brandPplIndexId) return false;
        if (filter === 'creator' && v.index_id !== creatorIndexId) return false;
        if (search.trim()) {
          const title = v.system_metadata?.filename || v.system_metadata?.video_title || v._id;
          return title.toLowerCase().includes(search.toLowerCase());
        }
        return true;
      })
      .slice(0, 200);
  }, [videos, filter, search, brandIndexId, brandPplIndexId, creatorIndexId]);

  const triggerAnalyze = async (vid?: string, idx?: string) => {
    const useVideoId = vid;
    const useIndexId = idx;
    if (!useVideoId || !useIndexId) {
      setMessage('Please enter both video ID and index ID.');
      return;
    }
    setAnalyzingVideoId(useVideoId);
    setMessage(null);
    try {
      const response = await axios.post('/api/brand-mentions/analyze', {
        videoId: useVideoId,
        indexId: useIndexId,
        force: true,
        segmentAnalysis: true,
      });
      if (response.data) {
        setMessage('Analysis triggered successfully.');
      } else {
        setMessage('Analysis request completed, but no response payload was returned.');
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to trigger analysis');
    } finally {
      setAnalyzingVideoId(null);
    }
  };

  const triggerBulkAnalyze = async () => {
    if (!creatorIndexId) {
      setMessage('Creator index ID is not configured.');
      return;
    }

    const creatorVideos = videos.filter(v => v.index_id === creatorIndexId);
    if (creatorVideos.length === 0) {
      setMessage('No creator videos found to analyze.');
      return;
    }

    setIsBulkAnalyzing(true);
    setBulkProgress({ current: 0, total: creatorVideos.length });
    setMessage(null);

    try {
      for (let i = 0; i < creatorVideos.length; i++) {
        const video = creatorVideos[i];
        setBulkProgress({ current: i + 1, total: creatorVideos.length });

        try {
          await axios.post('/api/brand-mentions/analyze', {
            videoId: video._id,
            indexId: video.index_id,
            force: true,
            segmentAnalysis: true,
          });
        } catch (error) {
          console.error(`❌ Failed to analyze video ${video._id}:`, error);
          // Continue with next video instead of stopping
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setMessage(`Bulk analysis completed! Processed ${creatorVideos.length} creator videos.`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to complete bulk analysis');
    } finally {
      setIsBulkAnalyzing(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  };

  const saveBrandOverride = async (videoId: string, indexId: string) => {
    const brandName = (brandEdits[videoId] || '').trim();
    if (!brandName) {
      setMessage('Please enter a brand name');
      return;
    }
    setSavingBrandId(videoId);
    setMessage(null);
    try {
      const payload = {
        videoId,
        indexId,
        user_metadata: {
          brand_override: brandName,
        },
      };
      const res = await axios.put('/api/videos/updateUserMetadata', payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.data?.success) {
        setVideos(prev => prev.map(v => v._id === videoId ? {
          ...v,
          user_metadata: {
            ...(v.user_metadata || {}),
            brand_override: brandName,
          },
        } : v));
        setMessage('Brand override saved');
      } else {
        setMessage(res.data?.error || 'Failed to save brand override');
      }
    } catch (e) {
      setMessage('Failed to save brand override');
    } finally {
      setSavingBrandId(null);
    }
  };

  const openMetaEditor = (v: AdminVideo) => {
    const meta = (v.user_metadata || {}) as Record<string, unknown>;
    const draft: Record<string, string> = {};
    Object.entries(meta).forEach(([k, val]) => {
      draft[k] = typeof val === 'string' ? val : JSON.stringify(val);
    });
    setMetaDraft(draft);
    setEditingMetaId(v._id);
  };

  const addMetaField = () => {
    const key = prompt('새 필드 이름을 입력하세요:');
    if (key && key.trim()) {
      setMetaDraft(prev => ({ ...prev, [key.trim()]: '' }));
    }
  };

  const removeMetaField = (key: string) => {
    setMetaDraft(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveMetadata = async (videoId: string, indexId: string) => {
    setSavingMetaId(videoId);
    setMessage(null);
    try {
      const payload: Record<string, string> = {};
      Object.entries(metaDraft).forEach(([k, v]) => {
        payload[k] = v;
      });
      const res = await axios.put('/api/videos/updateUserMetadata', {
        videoId,
        indexId,
        user_metadata: payload,
      });
      if (res.data?.success) {
        setVideos(prev => prev.map(v => v._id === videoId ? {
          ...v,
          user_metadata: { ...payload },
        } : v));
        setMessage('Metadata saved successfully');
        setEditingMetaId(null);
      } else {
        setMessage(res.data?.error || 'Failed to save metadata');
      }
    } catch {
      setMessage('Failed to save metadata');
    } finally {
      setSavingMetaId(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Admin</h1>

        {/* Bulk Analysis Section */}
        <div className="mb-6 p-4 border rounded-lg bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">Bulk Analysis</h2>
              <p className="text-sm text-gray-600">
                Re-analyze all creator videos to get updated location data
              </p>
              {isBulkAnalyzing && (
                <div className="mt-2">
                  <div className="text-sm text-blue-600">
                    Progress: {bulkProgress.current} / {bulkProgress.total} videos
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={triggerBulkAnalyze}
              disabled={isBulkAnalyzing || !creatorIndexId}
              className={clsx(
                'px-4 py-2 rounded font-medium',
                isBulkAnalyzing || !creatorIndexId
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isBulkAnalyzing ? 'Analyzing...' : 'Re-analyze All Creators'}
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-4 text-sm text-green-700">{message}</div>
        )}

        {/* Video browser */}
        <div className="p-4 border rounded-lg bg-gray-50">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm">Filter:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as 'all' | 'brand' | 'ppl' | 'creator')}
                className="px-2 py-1 border rounded"
              >
                <option value="all">All</option>
                <option value="brand">Brand</option>
                <option value="ppl">PPL</option>
                <option value="creator">Creator</option>
              </select>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="flex-1 min-w-[200px] px-3 py-2 border rounded"
            />
            <span className="text-sm text-gray-500">{filteredVideos.length} videos</span>
          </div>

          {isLoading ? (
            <div className="py-10 text-center">Loading videos...</div>
          ) : filteredVideos.length === 0 ? (
            <div className="py-10 text-center text-gray-600">No videos found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((v) => (
                <div key={`${v._id}-${v.index_id}`} className="border rounded-lg overflow-hidden bg-white">
                  <div className="aspect-video bg-gray-100">
                    {v.hls?.thumbnail_urls?.[0] && (
                      <img src={v.hls.thumbnail_urls[0]} alt="thumb" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm truncate">{v.system_metadata?.filename || v.system_metadata?.video_title || v._id}</h4>
                      <span className={clsx('text-xs px-2 py-0.5 rounded',
                        v.index_id === brandIndexId ? 'bg-purple-100 text-purple-700'
                          : v.index_id === brandPplIndexId ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      )}>
                        {v.index_id === brandIndexId ? 'Brand' : v.index_id === brandPplIndexId ? 'PPL' : 'Creator'}
                      </span>
                    </div>
                    {(v.index_id === brandIndexId || v.index_id === brandPplIndexId) && (
                      <div className="space-y-2">
                        <label className="block text-xs text-gray-600">Brand override</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={brandEdits[v._id] ?? (typeof v.user_metadata?.brand_override === 'string' ? String(v.user_metadata?.brand_override) : '')}
                            onChange={(e) => setBrandEdits(prev => ({ ...prev, [v._id]: e.target.value }))}
                            placeholder="Enter brand name"
                            className="flex-1 px-2 py-1 text-sm border rounded"
                          />
                          <button
                            onClick={() => saveBrandOverride(v._id, v.index_id)}
                            disabled={savingBrandId === v._id}
                            className={clsx(
                              'px-2 py-1 text-xs rounded',
                              savingBrandId === v._id ? 'bg-gray-300 text-gray-600 cursor-wait' : 'bg-black text-white hover:bg-gray-800'
                            )}
                          >
                            {savingBrandId === v._id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        {typeof v.user_metadata?.brand_override === 'string' && v.user_metadata?.brand_override && (
                          <div className="text-xs text-gray-500">Current: {String(v.user_metadata.brand_override)}</div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          await triggerAnalyze(v._id, v.index_id);
                        }}
                        disabled={analyzingVideoId !== null && analyzingVideoId !== v._id}
                        className={clsx(
                          'px-2 py-1 text-xs rounded',
                          analyzingVideoId === v._id
                            ? 'bg-gray-300 text-gray-600 cursor-wait'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        )}
                      >
                        {analyzingVideoId === v._id ? 'Analyzing...' : 'Force Re-analyze'}
                      </button>
                      <button
                        onClick={() => editingMetaId === v._id ? setEditingMetaId(null) : openMetaEditor(v)}
                        className={clsx(
                          'px-2 py-1 text-xs rounded',
                          editingMetaId === v._id
                            ? 'bg-gray-800 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        )}
                      >
                        {editingMetaId === v._id ? 'Close' : 'Edit Metadata'}
                      </button>
                    </div>
                    {/* Metadata Editor */}
                    {editingMetaId === v._id && (
                      <div className="mt-2 p-3 bg-gray-50 border rounded space-y-2 text-xs">
                        {Object.entries(metaDraft).length === 0 && (
                          <div className="text-gray-400 italic">No metadata fields</div>
                        )}
                        {Object.entries(metaDraft).map(([key, val]) => (
                          <div key={key} className="flex items-start gap-1">
                            <span className="font-mono text-gray-500 min-w-[80px] pt-1 break-all">{key}</span>
                            <textarea
                              value={val}
                              onChange={(e) => setMetaDraft(prev => ({ ...prev, [key]: e.target.value }))}
                              rows={val.length > 80 ? 3 : 1}
                              className="flex-1 px-2 py-1 border rounded font-mono text-xs resize-y"
                            />
                            <button
                              onClick={() => removeMetaField(key)}
                              className="text-red-400 hover:text-red-600 px-1 pt-1"
                              title="Remove field"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1 border-t">
                          <button
                            onClick={addMetaField}
                            className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
                          >
                            + Add Field
                          </button>
                          <button
                            onClick={() => saveMetadata(v._id, v.index_id)}
                            disabled={savingMetaId === v._id}
                            className={clsx(
                              'px-3 py-1 text-xs rounded',
                              savingMetaId === v._id
                                ? 'bg-gray-300 text-gray-500 cursor-wait'
                                : 'bg-black text-white hover:bg-gray-800'
                            )}
                          >
                            {savingMetaId === v._id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


