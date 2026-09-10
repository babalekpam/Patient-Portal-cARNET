import {
  Activity,
  AlertCircle,
  BarChart2,
  Calendar,
  Camera,
  Clock,
  Clipboard,
  CreditCard,
  Edit2,
  Home,
  Mail,
  Package,
  Share2,
  Shield,
  Thermometer,
  User,
  Users,
  Video,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./_group.css";

interface QuickAction {
  label: string;
  icon: LucideIcon;
}

const quickActions: QuickAction[] = [
  { label: "Telehealth", icon: Video },
  { label: "Schedule Appointment", icon: Calendar },
  { label: "Messages", icon: Mail },
  { label: "Visits", icon: Clipboard },
  { label: "Test Results", icon: BarChart2 },
  { label: "Medications", icon: Package },
  { label: "Account Summary", icon: CreditCard },
  { label: "Emergency Card", icon: AlertCircle },
  { label: "Health Timeline", icon: Clock },
  { label: "Symptom Checker", icon: Thermometer },
  { label: "Documents", icon: Camera },
  { label: "Family Members", icon: Users },
  { label: "Interaction Checker", icon: Zap },
  { label: "Export Records", icon: Share2 },
  { label: "Health Metrics", icon: Activity },
];

const mockProfile = {
  firstName: "Maria",
};

const mockMessage = {
  subject: "Your care plan update",
  sender: "Dr. Elena Carter",
  date: "Mar 21",
  message: "I reviewed your recent results and updated your care plan.",
};

const mockAppointment = {
  type: "Office Visit",
  month: "Apr",
  day: "16",
  weekday: "Wed",
  time: "10:30 AM EDT",
  location: "CARNET Medical Center",
  provider: "Dr. Elena Carter",
};

function Watermark() {
  return (
    <div className="carnet-watermark" aria-hidden="true">
      {Array.from({ length: 48 }, (_, index) => {
        const row = Math.floor(index / 6);
        const column = index % 6;
        return (
          <span
            className="carnet-watermark-tile"
            key={index}
            style={{
              left: column * 120 + (row % 2 === 1 ? 60 : 0),
              top: row * 120,
            }}
          >
            <img src="/__mockup/images/navimed-icon-only.png" alt="" />
          </span>
        );
      })}
    </div>
  );
}

function QuickActionTile({ item }: { item: QuickAction }) {
  const Icon = item.icon;
  return (
    <button className="carnet-tile" type="button" onClick={() => undefined}>
      <span className="carnet-tile-icon">
        <Icon size={28} strokeWidth={2} />
      </span>
      <span className="carnet-tile-label">{item.label}</span>
    </button>
  );
}

function MessagePreview() {
  return (
    <section className="carnet-card" aria-label="Latest message">
      <div className="carnet-preview-header">
        <span className="carnet-preview-icon">
          <Mail size={20} />
        </span>
        <h2 className="carnet-preview-title">{mockMessage.subject}</h2>
      </div>

      <div className="carnet-message-body">
        <span className="carnet-avatar">D</span>
        <div className="carnet-message-content">
          <div className="carnet-sender-row">
            <span className="carnet-sender">{mockMessage.sender}</span>
            <span className="carnet-date">{mockMessage.date}</span>
          </div>
          <p className="carnet-message-preview">{mockMessage.message}</p>
        </div>
      </div>

      <button className="carnet-primary-button" type="button">
        View Message
      </button>
      <div className="carnet-divider" />
      <button className="carnet-view-all" type="button">
        <Mail size={16} />
        <span>View All (3)</span>
      </button>
    </section>
  );
}

function AppointmentPreview() {
  return (
    <section className="carnet-card" aria-label="Upcoming appointment">
      <div className="carnet-preview-header">
        <span className="carnet-preview-icon">
          <Calendar size={18} />
        </span>
        <h2 className="carnet-preview-title carnet-visit-type">{mockAppointment.type}</h2>
      </div>

      <div className="carnet-appointment-body">
        <div className="carnet-date-column">
          <span className="carnet-month">{mockAppointment.month}</span>
          <span className="carnet-day">{mockAppointment.day}</span>
          <span className="carnet-weekday">{mockAppointment.weekday}</span>
        </div>
        <div className="carnet-appointment-details">
          <div className="carnet-detail-row">
            <Clock size={14} />
            <span>Starts at {mockAppointment.time}</span>
          </div>
          <div className="carnet-detail-row">
            <Home size={14} />
            <span>{mockAppointment.location}</span>
          </div>
          <div className="carnet-detail-row">
            <User size={14} />
            <span>With {mockAppointment.provider}</span>
          </div>
        </div>
      </div>

      <button className="carnet-primary-button" type="button">
        View Details
      </button>
    </section>
  );
}

export function Current() {
  return (
    <main className="carnet-current min-h-screen">
      <Watermark />
      <div className="carnet-scroll">
        <div className="carnet-content">
          <header className="carnet-header">
            <div className="carnet-header-row">
              <h1 className="carnet-welcome">Welcome, {mockProfile.firstName}</h1>
              <button className="carnet-icon-button" type="button" aria-label="Edit profile">
                <Edit2 size={18} />
              </button>
            </div>
          </header>

          <section className="carnet-tiles-wrap" aria-label="Quick actions">
            <div className="carnet-tiles">
              {quickActions.map((item) => (
                <QuickActionTile item={item} key={item.label} />
              ))}
            </div>
          </section>

          <div className="carnet-cards">
            <MessagePreview />
            <AppointmentPreview />
          </div>

          <footer className="carnet-footer">
            <Shield size={13} />
            <span>Powered by NaviMED</span>
          </footer>
        </div>
      </div>
    </main>
  );
}