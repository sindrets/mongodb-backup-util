
export type EventListener = {
    requirements: string[],
    callback: Function
}

export interface EventListenerDict { 
	[key: string]: EventListener[]
};

export interface OnceEventListenerDict {
    [key: string]: undefined | {
        done: boolean,
        args: any[],
        listeners: EventListener[]
    }
}
