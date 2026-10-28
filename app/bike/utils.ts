export const formatTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const baseArr = [minutes, seconds];
  if (hours > 0) baseArr.unshift(hours);
  return baseArr.map((n) => String(n).padStart(2, "0")).join(":");
};
