'use client';
import dynamic from 'next/dynamic';
import ControlsPanel from './ControlsPanel';
import KPIBar from './KPIBar';
const FenwayTranslator3D = dynamic(() => import('./FenwayTranslator3D'), { ssr: false });
import ContractNavigator from './ContractNavigator';
import PayrollBands from './PayrollBands';
import ExportActions from './ExportActions';

export default function WarRoom() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ControlsPanel />
      <KPIBar />
      <FenwayTranslator3D />
      <ContractNavigator />
      <PayrollBands />
      <ExportActions />
    </div>
  );
}
