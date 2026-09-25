import type { SVGProps } from 'react';

import {
  Alert02Icon,
  AnalyticsUpIcon,
  ArrowDown01Icon,
  ArrowDownRight01Icon,
  ArrowLeft02Icon,
  ArrowLeftRightIcon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  ArrowUpRight02Icon,
  Award01Icon,
  Bookmark01Icon,
  BookmarkCheck01Icon,
  Briefcase01Icon,
  CalendarCheckIn01Icon,
  Call02Icon,
  Camera01Icon,
  Cancel01Icon,
  ChartColumnIcon,
  CheckmarkCircle02Icon,
  ChevronDownIcon,
  ChevronRightIcon as ChevronRightIconData,
  Clock01Icon,
  CloudUploadIcon,
  Compass01Icon,
  CpuIcon,
  DashboardSquare01Icon,
  Delete02Icon,
  Download01Icon,
  EyeIcon,
  File02Icon,
  FilePenLineIcon,
  FileSearchIcon,
  FileUploadIcon,
  FlameIcon,
  Globe02Icon,
  GoogleIcon,
  HeadphonesIcon,
  HeartIcon,
  HelpCircleIcon,
  Home01Icon,
  Html5Icon,
  Key01Icon,
  LaptopIcon,
  Layers01Icon,
  Link01Icon,
  LinkSquare02Icon,
  Loading03Icon,
  Logout01Icon,
  Mail01Icon,
  Menu01Icon,
  Message01Icon,
  MessageQuestionIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  NewTwitterIcon,
  Notification03Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PauseIcon,
  PinterestIcon,
  PlayIcon,
  ReactIcon,
  RedditIcon,
  RefreshIcon,
  RoboticIcon,
  Rocket01Icon,
  RotateLeft01Icon,
  Search01Icon,
  SentIcon,
  Settings01Icon,
  Shield01Icon,
  ShieldKeyIcon,
  SlidersHorizontalIcon,
  SlidersVerticalIcon,
  SmartPhone01Icon,
  SnapchatIcon,
  SourceCodeIcon,
  SparklesIcon,
  SpotifyIcon,
  SquareIcon,
  Sun01Icon,
  Task01Icon,
  Tick02Icon,
  UserCheck01Icon,
  UserGroupIcon,
  UserIcon,
  Video01Icon,
  Wifi01Icon,
  WorkflowSquare01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

import { cn } from './utils';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

function icon(data: IconSvgElement) {
  function Icon({ className, size, strokeWidth = 1.75, ...rest }: IconProps) {
    return (
      <HugeiconsIcon
        icon={data}
        color="currentColor"
        strokeWidth={strokeWidth}
        className={cn('size-4 shrink-0', className)}
        {...rest}
        {...(size != null ? { size } : { width: undefined, height: undefined })}
      />
    );
  }
  return Icon;
}

export const AlertTriangle = icon(Alert02Icon);
export const ArrowDownRight = icon(ArrowDownRight01Icon);
export const ArrowLeft = icon(ArrowLeft02Icon);
export const ArrowLeftRight = icon(ArrowLeftRightIcon);
export const ArrowRight = icon(ArrowRight02Icon);
export const ArrowUp = icon(ArrowUp02Icon);
export const ArrowUpDown = icon(ArrowUpDownIcon);
export const ArrowUpRight = icon(ArrowUpRight02Icon);
export const Award = icon(Award01Icon);
export const Bell = icon(Notification03Icon);
export const Bookmark = icon(Bookmark01Icon);
export const BookmarkCheck = icon(BookmarkCheck01Icon);
export const Bot = icon(RoboticIcon);
export const Briefcase = icon(Briefcase01Icon);
export const CalendarCheck = icon(CalendarCheckIn01Icon);
export const Camera = icon(Camera01Icon);
export const Check = icon(Tick02Icon);
export const CheckCircle2 = icon(CheckmarkCircle02Icon);
export const ChevronDown = icon(ChevronDownIcon);
export const ChevronRight = icon(ChevronRightIconData);
export const CircleCheck = icon(CheckmarkCircle02Icon);
export const Clock = icon(Clock01Icon);
export const Code2 = icon(SourceCodeIcon);
export const Download = icon(Download01Icon);
export const ExternalLink = icon(LinkSquare02Icon);
export const Eye = icon(EyeIcon);
export const FilePenLine = icon(FilePenLineIcon);
export const FileSearch = icon(FileSearchIcon);
export const FileText = icon(File02Icon);
export const FileUp = icon(FileUploadIcon);
export const Flame = icon(FlameIcon);
export const Globe = icon(Globe02Icon);
export const HelpCircle = icon(HelpCircleIcon);
export const Home = icon(Home01Icon);
export const Key = icon(Key01Icon);
export const Laptop = icon(LaptopIcon);
export const Layers = icon(Layers01Icon);
export const Link2 = icon(Link01Icon);
export const Loader2 = icon(Loading03Icon);
export const Menu = icon(Menu01Icon);
export const MessageCircle = icon(Message01Icon);
export const Moon = icon(Moon02Icon);
export const MoreHorizontal = icon(MoreHorizontalIcon);
export const Pause = icon(PauseIcon);
export const Play = icon(PlayIcon);
export const RefreshCw = icon(RefreshIcon);
export const Rocket = icon(Rocket01Icon);
export const RotateCcw = icon(RotateLeft01Icon);
export const Search = icon(Search01Icon);
export const Send = icon(SentIcon);
export const Shield = icon(Shield01Icon);
export const ShieldCheck = icon(ShieldKeyIcon);
export const Sliders = icon(SlidersVerticalIcon);
export const SlidersHorizontal = icon(SlidersHorizontalIcon);
export const Smartphone = icon(SmartPhone01Icon);
export const Sparkles = icon(SparklesIcon);
export const Square = icon(SquareIcon);
export const Sun = icon(Sun01Icon);
export const Trash2 = icon(Delete02Icon);
export const UploadCloud = icon(CloudUploadIcon);
export const User = icon(UserIcon);
export const UserCheck = icon(UserCheck01Icon);
export const Users = icon(UserGroupIcon);
export const Wifi = icon(Wifi01Icon);
export const Workflow = icon(WorkflowSquare01Icon);
export const X = icon(Cancel01Icon);
export const Zap = icon(ZapIcon);
export const PanelLeftClose = icon(PanelLeftCloseIcon);
export const PanelLeftOpen = icon(PanelLeftOpenIcon);
export const Google = icon(GoogleIcon);
export const Reddit = icon(RedditIcon);
export const Twitter = icon(NewTwitterIcon);
export const ReactLogo = icon(ReactIcon);
export const Html5 = icon(Html5Icon);
export const RiCpuLine = icon(CpuIcon);
export const RiCompass3Line = icon(Compass01Icon);
export const RiDashboardLine = icon(DashboardSquare01Icon);
export const RiFileList3Line = icon(Task01Icon);
export const RiFileTextLine = icon(File02Icon);
export const RiGroupLine = icon(UserGroupIcon);
export const RiLogoutBoxRLine = icon(Logout01Icon);
export const RiQuestionLine = icon(HelpCircleIcon);
export const RiSendPlaneLine = icon(SentIcon);
export const RiSettings3Line = icon(Settings01Icon);
export const RiShieldKeyholeLine = icon(ShieldKeyIcon);
export const RiSparklingLine = icon(SparklesIcon);
export const RiStackLine = icon(Layers01Icon);
export const RiUser3Line = icon(UserIcon);
export const AiFillSpotify = icon(SpotifyIcon);
export const BiLinkExternal = icon(LinkSquare02Icon);
export const CiGlobe = icon(Globe02Icon);
export const CiHeart = icon(HeartIcon);
export const FaHeadphones = icon(HeadphonesIcon);
export const FaPhoneAlt = icon(Call02Icon);
export const FaPinterest = icon(PinterestIcon);
export const FaSnapchatGhost = icon(SnapchatIcon);
export const FaXTwitter = icon(NewTwitterIcon);
export const HiOutlineChartBar = icon(ChartColumnIcon);
export const IoIosTrendingUp = icon(AnalyticsUpIcon);
export const IoMdCheckmark = icon(Tick02Icon);
export const IoMdCode = icon(SourceCodeIcon);
export const LuLoader = icon(Loading03Icon);
export const MdMarkunread = icon(Mail01Icon);
export const MdOutlineKeyboardArrowDown = icon(ArrowDown01Icon);
export const MdOutlineQuestionAnswer = icon(MessageQuestionIcon);
export const RiNetflixFill = icon(Video01Icon);
export const ChevronRightIcon = ChevronRight;
