// import { Button } from '@/components/ui/button';
// import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
// import { Input } from '@/components/ui/input';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
// import type { Album, Track } from '@melody-manager/shared';
// import { Clock, GripVertical, Plus, Trash2 } from 'lucide-react';
// import { useMutation } from 'pocketbase-react-hooks';
// import { useCallback, useEffect, useState } from 'react';
// import { toast } from 'sonner';

// interface Props {
//   album: Album;
// }

// interface EditableTrack extends Track {
//   tempId: string;
//   metadata: {
//     startTime?: number;
//     endTime?: number;
//   };
// }

// function formatTime(seconds: number): string {
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const secs = Math.floor(seconds % 60);
//   return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
// }

// function parseTime(timeStr: string): number | null {
//   const parts = timeStr.split(':').map((p) => Number.parseInt(p.trim(), 10));
//   if (parts.length === 3 && parts.every((p) => !Number.isNaN(p))) {
//     const [hours, minutes, seconds] = parts;
//     return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
//   }
//   if (parts.length === 2 && parts.every((p) => !Number.isNaN(p))) {
//     const [minutes, seconds] = parts;
//     return (minutes ?? 0) * 60 + (seconds ?? 0);
//   }
//   return null;
// }

// export function EditTimestampsDialog({ album }: Props) {
//   const [editableTracks, setEditableTracks] = useState<EditableTrack[]>([]);
//   const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

//   const tracks = album?.expand?.tracks_via_album ?? [];

//   const { mutateAsync: updateTrack, isPending: isUpdating } = useMutation('tracks', 'update');
//   const { mutateAsync: createTrack, isPending: isCreating } = useMutation('tracks', 'create');
//   const isPending = isUpdating || isCreating;

//   useEffect(() => {
//     setEditableTracks(
//       tracks.map((track, index) => ({
//         ...track,
//         tempId: `${track.id}-${index}`,
//         metadata: {
//           startTime: track.metadata?.startTime ?? 0,
//           endTime: track.metadata?.endTime ?? track.duration,
//         },
//       })),
//     );
//   }, [tracks]);

//   const updateTrackField = useCallback((index: number, field: 'title' | 'startTime' | 'endTime', value: string) => {
//     setEditableTracks((prev) => {
//       const newTracks = [...prev];
//       const track = newTracks[index];
//       if (!track) return prev;

//       if (field === 'title') {
//         track.title = value;
//       } else if (field === 'startTime' || field === 'endTime') {
//         const seconds = parseTime(value);
//         if (seconds !== null && track.metadata) {
//           track.metadata[field] = seconds;
//           if (field === 'startTime' && track.metadata.endTime !== undefined) {
//             track.duration = Math.max(1, track.metadata.endTime - seconds);
//           } else if (field === 'endTime' && track.metadata.startTime !== undefined) {
//             track.duration = Math.max(1, seconds - track.metadata.startTime);
//           }
//         }
//       }
//       return newTracks;
//     });
//   }, []);

//   const addTrack = useCallback(() => {
//     const lastTrack = editableTracks[editableTracks.length - 1];
//     const newStartTime = lastTrack?.metadata?.endTime ?? 0;
//     const firstTrack = editableTracks[0];

//     if (!firstTrack) return;

//     setEditableTracks((prev) => [
//       ...prev,
//       {
//         ...firstTrack,
//         id: '',
//         tempId: `new-${Date.now()}`,
//         title: 'New Track',
//         duration: 60,
//         metadata: {
//           startTime: newStartTime,
//           endTime: newStartTime + 60,
//         },
//       },
//     ]);
//   }, [editableTracks]);

//   const addTrackAfter = useCallback(
//     (index: number) => {
//       const currentTrack = editableTracks[index];
//       const firstTrack = editableTracks[0];

//       if (!currentTrack || !firstTrack) return;

//       const newStartTime = currentTrack.metadata?.endTime ?? currentTrack.duration;

//       setEditableTracks((prev) => {
//         const newTrack = {
//           ...firstTrack,
//           id: '',
//           tempId: `new-${Date.now()}`,
//           title: 'New Track',
//           duration: 60,
//           metadata: {
//             startTime: newStartTime,
//             endTime: newStartTime + 60,
//           },
//         };
//         const newTracks = [...prev];
//         newTracks.splice(index + 1, 0, newTrack);
//         return newTracks;
//       });
//     },
//     [editableTracks],
//   );

//   const deleteTrack = useCallback((index: number) => {
//     setEditableTracks((prev) => prev.filter((_, i) => i !== index));
//   }, []);

//   const handleDragStart = useCallback((index: number) => {
//     setDraggedIndex(index);
//   }, []);

//   const handleDragOver = useCallback((e: React.DragEvent) => {
//     e.preventDefault();
//   }, []);

//   const handleDrop = useCallback(
//     (e: React.DragEvent, dropIndex: number) => {
//       e.preventDefault();
//       if (draggedIndex === null || draggedIndex === dropIndex) {
//         setDraggedIndex(null);
//         return;
//       }

//       setEditableTracks((prev) => {
//         const newTracks = [...prev];
//         const [draggedTrack] = newTracks.splice(draggedIndex, 1);
//         if (draggedTrack) {
//           newTracks.splice(dropIndex, 0, draggedTrack);
//         }
//         return newTracks;
//       });
//       setDraggedIndex(null);
//     },
//     [draggedIndex],
//   );

//   const handleDragEnd = useCallback(() => {
//     setDraggedIndex(null);
//   }, []);

//   const handleSave = useCallback(async () => {
//     try {
//       const promises: Promise<unknown>[] = [];

//       for (const track of editableTracks) {
//         const metadata = {
//           ...(track.metadata ?? {}),
//           startTime: track.metadata?.startTime,
//           endTime: track.metadata?.endTime,
//         };

//         if (track.id) {
//           promises.push(
//             updateTrack(track.id, {
//               title: track.title,
//               duration: track.duration,
//               metadata,
//             }),
//           );
//         } else {
//           const referenceTrack = tracks[0];
//           if (referenceTrack) {
//             promises.push(
//               createTrack({
//                 title: track.title,
//                 duration: track.duration,
//                 sourceUrl: referenceTrack.sourceUrl,
//                 provider: referenceTrack.provider,
//                 artists: referenceTrack.artists,
//                 album: referenceTrack.album,
//                 genres: referenceTrack.genres || [],
//                 metadata,
//               }),
//             );
//           }
//         }
//       }

//       await Promise.all(promises);
//       toast.success('Timestamps updated successfully');
//     } catch (error) {
//       console.error('Failed to update timestamps:', error);
//       toast.error('Failed to update timestamps');
//     }
//   }, [editableTracks, updateTrack, createTrack, tracks]);

//   return (
//     <Dialog modal>
//       <DialogTrigger asChild>
//         <DropdownMenuItem>
//           <Clock className="h-4 w-4 mr-2" />
//           Edit Timestamps
//         </DropdownMenuItem>
//       </DialogTrigger>
//       <DialogContent className="max-w-[98vw] sm:max-w-[95vw] lg:max-w-[90vw] w-full max-h-[80vh] p-0 gap-0">
//         <div className="flex flex-col max-h-[80vh]">
//           <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
//             <DialogTitle className="text-2xl">Edit Album Timestamps</DialogTitle>
//             <DialogDescription>Edit track titles, start times, and end times. You can also reorder, add, or delete tracks.</DialogDescription>
//           </DialogHeader>

//           <div className="flex-1 overflow-auto border-t mx-6 scrollbar-dialog-content">
//             <Table>
//               <TableHeader className="sticky top-0 bg-background z-10">
//                 <TableRow>
//                   <TableHead className="w-12">#</TableHead>
//                   <TableHead className="w-12" />
//                   <TableHead>Title</TableHead>
//                   <TableHead className="w-32">Start Time</TableHead>
//                   <TableHead className="w-32">End Time</TableHead>
//                   <TableHead className="w-24">Duration</TableHead>
//                   <TableHead className="w-20">Actions</TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {editableTracks.map((track, index) => (
//                   <TableRow key={track.tempId} draggable onDragStart={() => handleDragStart(index)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, index)} onDragEnd={handleDragEnd} className={`cursor-move ${draggedIndex === index ? 'opacity-50' : ''}`}>
//                     <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
//                     <TableCell>
//                       <GripVertical className="h-4 w-4 text-muted-foreground" />
//                     </TableCell>
//                     <TableCell>
//                       <Input value={track.title} onChange={(e) => updateTrackField(index, 'title', e.target.value)} className="h-8" />
//                     </TableCell>
//                     <TableCell>
//                       <Input value={formatTime(track.metadata?.startTime ?? 0)} onChange={(e) => updateTrackField(index, 'startTime', e.target.value)} className="h-8 font-mono" placeholder="HH:MM:SS" />
//                     </TableCell>
//                     <TableCell>
//                       <Input value={formatTime(track.metadata?.endTime ?? track.duration)} onChange={(e) => updateTrackField(index, 'endTime', e.target.value)} className="h-8 font-mono" placeholder="HH:MM:SS" />
//                     </TableCell>
//                     <TableCell className="text-center text-muted-foreground font-mono text-sm">{formatTime(track.duration)}</TableCell>
//                     <TableCell>
//                       <div className="flex gap-1">
//                         <Button variant="ghost" size="icon" onClick={() => addTrackAfter(index)} className="h-8 w-8" title="Add track after">
//                           <Plus className="h-4 w-4" />
//                         </Button>
//                         <Button variant="ghost" size="icon" onClick={() => deleteTrack(index)} className="h-8 w-8" title="Delete track">
//                           <Trash2 className="h-4 w-4 text-destructive" />
//                         </Button>
//                       </div>
//                     </TableCell>
//                   </TableRow>
//                 ))}
//               </TableBody>
//             </Table>
//           </div>

//           <DialogFooter className="px-6 py-4 shrink-0 flex justify-between items-center border-t">
//             <Button variant="outline" onClick={addTrack} className="gap-2">
//               <Plus className="h-4 w-4" />
//               Add Track
//             </Button>
//             <div className="flex gap-2">
//               <Button variant="outline">Cancel</Button>
//               <Button onClick={handleSave} disabled={isPending}>
//                 {isPending ? 'Saving...' : 'Save Changes'}
//               </Button>
//             </div>
//           </DialogFooter>
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }
