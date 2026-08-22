// src/components/widgets/SystemAlertsWidget.tsx
import React, { useState, useEffect } from 'react';
import { dataProcessor } from '@/lib/services/data-processor';

// Placeholder Component Structure - Requires full implementation
const SystemAlertsWidget: React.FC = () => {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAlerts = async () => {
            setLoading(true);
            // 1. Use the new dataProcessor to fetch the actual events
            const events = await dataProcessor.fetchLastEvents(5);
            
            // 2. Here we will map/filter these events to determine:
            //    - Last successful run time (from AgentState)
            //    - Last 5 errors (from AgentEvent.level === 'down')
            
            // --- Placeholder Mapping ---
            const criticalErrors = events.filter(e => e.level === 'down');
            const successfulRuns = events.filter(e => e.type === 'run' && e.metadata && e.metadata.status === 'success');

            // Dummy logic to set state until full integration
            setAlerts([
                { type: "info", message: "Loading agent status from message bus...", source: "DataProcessor" }
            ]);
            setLoading(false);
        };
        fetchAlerts();
    }, []);

    if (loading) return <div className="text-gray-500">Loading System Alerts...</div>;

    return (
        <div className="card">
            <h3 className="text-lg font-semibold">Agent Health Status</h3>
            <div className="space-y-2 mt-4">
                {alerts.map((alert, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-red-50 border-red-200">
                        <span className="font-bold text-red-700">{alert.type}:</span> {alert.message}
                    </div>
                ))}
                {/* Future components for Metrics/Critical path */}
            </div>
        </div>
    );
};

export default SystemAlertsWidget;