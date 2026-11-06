// Barra inferior parecida a la nativa, solo para la vista previa en navegador.
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

type TriggerProps = { name: string; children: ReactNode };
function Trigger(_: TriggerProps): ReactNode {
  return null;
}
Trigger.Label = function Label(_: { children: ReactNode }): ReactNode {
  return null;
};
Trigger.Icon = function TabIcon(_: { src: number }): ReactNode {
  return null;
};

const hrefs: Record<string, string> = { index: '/', productos: '/productos', ajustes: '/ajustes' };

export function NativeTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TriggerProps>[];
  return (
    <Tabs>
      <TabSlot />
      <TabList style={{ height: 76, backgroundColor: '#fff', flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E3EBE8' }}>
        {tabs.map((tab) => {
          const parts = Children.toArray(tab.props.children) as ReactElement<{ children: string; src: number }>[];
          const label = parts[0].props.children;
          return (
            <TabTrigger key={tab.props.name} name={tab.props.name} href={hrefs[tab.props.name] as never} asChild>
              <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }} accessibilityLabel={`pestaña ${label}`}>
                <Image source={parts[1].props.src} style={{ width: 22, height: 22, tintColor: '#4F6A63' }} />
                <Text style={{ fontSize: 13, color: '#4F6A63' }}>{label}</Text>
              </Pressable>
            </TabTrigger>
          );
        })}
      </TabList>
    </Tabs>
  );
}
NativeTabs.Trigger = Trigger;
export default function Empty() {
  return <View />;
}
