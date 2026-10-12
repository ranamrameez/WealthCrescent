import { create } from 'zustand';
interface ToastState {
  message: string | null;
  messages: { id: number; text: string }[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
}
let nextId = 0;
export const useToastStore = create<ToastState>((set,get) => ({
  message: null, messages: [],
  dismiss: (id) => set(state => {
    const messages = state.messages.filter(item => item.id !== id);
    return {messages,message:messages.at(-1)?.text ?? null};
  }),
  show: (message) => {
    const id = ++nextId;
    set(state => ({message,messages:[...state.messages,{id,text:message}]}));
    setTimeout(() => get().dismiss(id),2600);
  },
}));
export function toast(message: string) { useToastStore.getState().show(message); }
export function Toast() {
  const messages = useToastStore(state => state.messages);
  return <>{messages.map(item => <div key={item.id} className="toast show" role="status">{item.text}</div>)}</>;
}
