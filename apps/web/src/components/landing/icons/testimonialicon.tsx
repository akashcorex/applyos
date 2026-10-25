import { MessageCircle } from '@applyso/ui/icons';

const TestimonialIcon = () => {
  return (
    <div className="[perspective:400px] [transform-style:preserve-3d]">
      <div
        className="relative mx-auto h-14 w-14 rounded-md bg-gradient-to-b from-neutral-800 to-neutral-950 p-[4px]"
        style={{ transform: 'rotateX(25deg)', transformOrigin: 'center' }}
      >
        <div className="relative z-20 flex h-full w-full items-center justify-center overflow-hidden rounded-[7px] bg-black">
          <MessageCircle className="h-6 w-6 text-violet-400" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 mx-auto h-4 w-full rounded-full bg-neutral-600 opacity-50 blur-lg" />

        <div className="absolute inset-x-0 bottom-0 mx-auto h-px w-[60%] bg-gradient-to-r from-transparent via-violet-400 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 mx-auto h-[8px] w-[60%] bg-gradient-to-r from-transparent via-violet-500 to-transparent blur-sm" />
      </div>
    </div>
  );
};

export default TestimonialIcon;
