import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, Download, Video, Mic, AlertCircle } from 'lucide-react';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  recordedBlob: Blob | null;
  error: string | null;
}

const VideoRecorder: React.FC = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    recordedBlob: null,
    error: null
  });
  
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const drawIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) return;
      
      setRecordingState(prev => ({ ...prev, error: null }));
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Start drawing video frames to canvas
      drawIntervalRef.current = setInterval(() => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }, 16); // ~60 FPS for smoother recording

      // Get video stream from canvas
      const videoStream = canvas.captureStream(60);

      // Create a more reliable audio capture
      let combinedStream = videoStream;
      
      try {
        // Try to get audio from the video element
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Resume audio context if suspended
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        
        // Create a gain node to ensure audio levels
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.0;
        
        source.connect(gainNode);
        gainNode.connect(dest);
        gainNode.connect(audioCtx.destination);
        
        const audioStream = dest.stream;
        
        // Combine video and audio streams
        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioStream.getAudioTracks()
        ]);
      } catch (audioError) {
        console.warn('Audio capture failed, recording video only:', audioError);
        // Continue with video-only recording
      }


      recordedChunksRef.current = [];
      
      // Try different codecs for better compatibility
      let options = { mimeType: 'video/webm;codecs=vp9,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8,opus' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/mp4' };
      }
      
      recorderRef.current = new MediaRecorder(combinedStream, options);

      recorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorderRef.current.onstop = () => {
        if (drawIntervalRef.current) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
        
        // Use the same mime type as the recorder
        const mimeType = recorderRef.current?.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        
        setRecordingState(prev => ({ 
          ...prev, 
          recordedBlob: blob, 
          isRecording: false 
        }));
        
        if (recordedVideoRef.current) {
          const url = URL.createObjectURL(blob);
          recordedVideoRef.current.src = url;
          recordedVideoRef.current.load(); // Force reload
        }
      };

      recorderRef.current.start(100); // Collect data every 100ms
      setRecordingState(prev => ({ ...prev, isRecording: true }));
      
    } catch (error) {
      setRecordingState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Recording failed' 
      }));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recordingState.isRecording) {
      recorderRef.current.stop();
    }
  };

  const downloadRecording = () => {
    if (recordingState.recordedBlob) {
      const url = URL.createObjectURL(recordingState.recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      const extension = recordingState.recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      a.download = `recorded-video-${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleVideoLoad = () => {
    setIsVideoLoaded(true);
  };

  const handleVideoError = () => {
    setRecordingState(prev => ({ 
      ...prev, 
      error: 'Failed to load video. Please check the URL.' 
    }));
    setIsVideoLoaded(false);
  };

  useEffect(() => {
    return () => {
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
      }
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-blue-600 rounded-full">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Video Recorder</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Record video content with synchronized audio. Enter a video URL to get started.
          </p>
        </div>

        {/* Video URL Input */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 mb-2">
            Video URL
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              id="videoUrl"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Enter video URL (MP4, WebM, etc.)"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors"
            />
            <button
              onClick={() => setIsVideoLoaded(false)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Load Video
            </button>
          </div>
        </div>

        {/* Error Display */}
        {recordingState.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-800 font-medium">Error:</span>
              <span className="text-red-700">{recordingState.error}</span>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Original Video */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Play className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Original Video</h2>
            </div>
            
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  controls
                  crossOrigin="anonymous"
                  onLoadedData={handleVideoLoad}
                  onError={handleVideoError}
                >
                  <source src={videoUrl} type="video/mp4" />
                  Your browser does not support HTML5 video.
                </video>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Enter a video URL to get started
                </div>
              )}
            </div>

            {/* Recording Controls */}
            <div className="flex gap-3">
              <button
                onClick={startRecording}
                disabled={!isVideoLoaded || recordingState.isRecording}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <Mic className="w-5 h-5" />
                {recordingState.isRecording ? 'Recording...' : 'Start Recording'}
              </button>
              
              <button
                onClick={stopRecording}
                disabled={!recordingState.isRecording}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <Square className="w-5 h-5" />
                Stop
              </button>
            </div>
          </div>

          {/* Recorded Video */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Recorded Video</h2>
            </div>
            
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
              {recordingState.recordedBlob ? (
                <video
                  ref={recordedVideoRef}
                  className="w-full h-full object-cover"
                  controls
                  preload="metadata"
                  onLoadedData={() => console.log('Recorded video loaded successfully')}
                  onError={(e) => console.error('Recorded video error:', e)}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  {recordingState.isRecording ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      Recording in progress...
                    </div>
                  ) : (
                    'Recorded video will appear here'
                  )}
                </div>
              )}
            </div>

            {/* Download Button */}
            <button
              onClick={downloadRecording}
              disabled={!recordingState.recordedBlob}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Download Recording
            </button>
          </div>
        </div>

        {/* Hidden Canvas for Recording */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default VideoRecorder;