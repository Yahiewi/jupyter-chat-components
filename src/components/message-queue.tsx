import * as React from 'react';

import { PathExt } from '@jupyterlab/coreutils';
import { fileIcon, notebookIcon } from '@jupyterlab/ui-components';

import {
  IComponentProps,
  IMessageQueueMetadata,
  IQueuedMessageAttachment,
  RemoveQueuedMessage,
  ReorderQueuedMessages
} from '../token';

export interface IMessageQueueProps
  extends IComponentProps, IMessageQueueMetadata {
  removeQueuedMessage?: RemoveQueuedMessage;
  reorderQueuedMessages?: ReorderQueuedMessages;
}

function AttachmentIcon({
  type
}: {
  type: IQueuedMessageAttachment['type'];
}): JSX.Element {
  const Icon = type === 'notebook' ? notebookIcon.react : fileIcon.react;
  return <Icon tag="span" className="jp-chat-message-queue-attachment-icon" />;
}

function attachmentName(attachment: IQueuedMessageAttachment): string {
  return PathExt.basename(attachment.value) || attachment.value;
}

export const MessageQueue: React.FC<IMessageQueueProps> = ({
  messages,
  targetId,
  trans,
  removeQueuedMessage,
  reorderQueuedMessages
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);
  const [dropLineIndex, setDropLineIndex] = React.useState<number | null>(null);

  if (!messages || messages.length === 0) {
    return null;
  }

  const canDrag = !!reorderQueuedMessages && !!targetId;

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // Full-width row dragover: use Y midpoint to decide before or after this item.
  const handleRowDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDropLineIndex(
      e.clientY < rect.top + rect.height / 2 ? index : index + 1
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (
      draggedIndex === null ||
      dropLineIndex === null ||
      !reorderQueuedMessages ||
      !targetId
    ) {
      setDraggedIndex(null);
      setDropLineIndex(null);
      return;
    }
    const reordered = [...messages];
    const [moved] = reordered.splice(draggedIndex, 1);
    const insertAt =
      draggedIndex < dropLineIndex ? dropLineIndex - 1 : dropLineIndex;
    reordered.splice(insertAt, 0, moved);
    reorderQueuedMessages(
      targetId,
      reordered.map(m => m.id)
    );
    setDraggedIndex(null);
    setDropLineIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropLineIndex(null);
  };

  return (
    <div className="jp-chat-message-queue">
      <div className="jp-chat-message-queue-header">
        <span className="jp-chat-message-queue-count">
          {trans.__('%1 queued', messages.length)}
        </span>
        <button
          className="jp-chat-message-queue-toggle"
          onClick={() => setExpanded(e => !e)}
          type="button"
          title={
            expanded ? trans.__('Collapse queue') : trans.__('Expand queue')
          }
          aria-expanded={expanded}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>
      {expanded && (
        <div
          className="jp-chat-message-queue-list"
          onDrop={canDrag ? handleDrop : undefined}
        >
          {messages.map((msg, index) => (
            <React.Fragment key={msg.id}>
              {dropLineIndex === index && (
                <div className="jp-chat-message-queue-drop-line" />
              )}
              {/* Full-width row: dragover fires anywhere across the row width */}
              <div
                className="jp-chat-message-queue-row"
                onDragOver={
                  canDrag ? e => handleRowDragOver(e, index) : undefined
                }
              >
                <div
                  className={[
                    'jp-chat-message-queue-bubble',
                    draggedIndex === index
                      ? 'jp-chat-message-queue-bubble-dragging'
                      : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={canDrag}
                  onDragStart={
                    canDrag ? () => handleDragStart(index) : undefined
                  }
                  onDragEnd={canDrag ? handleDragEnd : undefined}
                  title={msg.body}
                >
                  {canDrag && (
                    <span
                      className="jp-chat-message-queue-drag-handle"
                      aria-hidden="true"
                    />
                  )}
                  <div className="jp-chat-message-queue-content">
                    {msg.body && (
                      <span className="jp-chat-message-queue-text">
                        {msg.body}
                      </span>
                    )}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="jp-chat-message-queue-attachments">
                        {msg.attachments.map((attachment, i) => (
                          <span
                            key={i}
                            className="jp-chat-message-queue-attachment-item"
                            title={attachment.value}
                          >
                            <AttachmentIcon type={attachment.type} />
                            {attachmentName(attachment)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {removeQueuedMessage && targetId && (
                    <button
                      className="jp-chat-message-queue-remove"
                      onClick={() => removeQueuedMessage(targetId, msg.id)}
                      title={trans.__('Remove from queue')}
                      type="button"
                    >
                      {'✕'}
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
          {dropLineIndex === messages.length && (
            <div className="jp-chat-message-queue-drop-line" />
          )}
          {/* End zone: catches drops below the last item */}
          <div
            className="jp-chat-message-queue-end-zone"
            onDragOver={
              canDrag
                ? e => {
                    e.preventDefault();
                    setDropLineIndex(messages.length);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
