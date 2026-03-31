/**
 * Base class for any printer axis (X, Y, or Z)
 */
export class BaseAxis {
    constructor(printerModel, config = {}) {
        this.printerModel = printerModel;
        
        // Configuration with defaults
        this.axisName = config.axisName || 'Axis';
        this.maxTravel = config.maxTravel || 220; // mm
        this.modelScale = config.modelScale || 1.0;
        this.screwPitch = config.screwPitch || 8; // mm per rotation
        
        this.currentPosition = 0;
        this.timeline = [];
        this.isAnimating = false;
    }

    findPartByName(partName) {
        if (!this.printerModel) return null;
        let found = null;
        this.printerModel.traverse((child) => {
            if (child.name === partName) found = child;
        });
        return found;
    }

    moveToPosition(position, duration = 0) {
        const target = Math.max(0, Math.min(this.maxTravel, position));
        if (duration === 0) {
            this.setPosition(target);
        } else {
            this.animateToPosition(target, duration);
        }
    }

    setPosition(position) {
        this.currentPosition = position;
        this.updatePartsPosition(position);
    }

    animateToPosition(targetPosition, duration) {
        const startPosition = this.currentPosition;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-in-out
            const ease = progress < 0.5 
                ? 2 * progress * progress 
                : -1 + (4 - 2 * progress) * progress;

            const currentPos = startPosition + (targetPosition - startPosition) * ease;
            this.setPosition(currentPos);

            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    /**
     * @ABSTRACT - Must be overridden by XAxis, YAxis, etc.
     */
    updatePartsPosition(position) {
        throw new Error("updatePartsPosition() must be implemented by subclass");
    }

    // ... PlayTimeline, StopTimeline, and Home methods remain the same here
    /**
     * Play the timeline animation
     */
    playTimeline() {
        if (this.timeline.length < 2) {
            console.error('Timeline must have at least 2 keyframes');
            return;
        }

        this.isAnimating = true;
        const startTime = Date.now();
        const totalDuration = this.timeline[this.timeline.length - 1].time;

        const animateTimeline = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / totalDuration;

            if (progress >= 1) {
                // Animation complete
                this.setPosition(this.timeline[this.timeline.length - 1].position);
                this.isAnimating = false;
                console.log('Timeline animation complete');
                return;
            }

            // Find current segment
            let currentIndex = 0;
            for (let i = 0; i < this.timeline.length - 1; i++) {
                if (elapsed >= this.timeline[i].time && elapsed < this.timeline[i + 1].time) {
                    currentIndex = i;
                    break;
                }
            }

            const keyframe1 = this.timeline[currentIndex];
            const keyframe2 = this.timeline[currentIndex + 1];
            
            const segmentProgress = (elapsed - keyframe1.time) / (keyframe2.time - keyframe1.time);
            const currentPos = keyframe1.position + (keyframe2.position - keyframe1.position) * segmentProgress;

            this.setPosition(currentPos);
            requestAnimationFrame(animateTimeline);
        };

        requestAnimationFrame(animateTimeline);
    }

    /**
     * Stop the timeline animation
     */
    stopTimeline() {
        this.isAnimating = false;
        console.log('Timeline animation stopped');
    }

    /**
     * Reset to home position (X=0)
     */
    home() {
        this.moveToPosition(0, 500);  // 500ms animation
    }

    /**
     * Get current position
     */
    getPosition() {
        return this.currentPosition;
    }

    /**
     * Get movement range info
     */
    getRangeInfo() {
        return {
            min: 0,
            max: this.maxTravel,
            current: this.currentPosition,
            screwPitch: this.screwPitch
        };
    }

}