var nothing = function() {};
var beat_sensitivity = 0.8;
var beat_test = function(beats, number_of_buffers) {
	if (beats > beat_sensitivity*number_of_buffers) {
		return true;
	}
	return false;
}
function listen_for_beats (audio_element, config_object) {
	var config = {
			sampling_length: 20,
			number_of_subbands: 10,
			first_subband_width: 30,
			onBeat: nothing,
			offBeat: nothing,
			sensitivity: 1,
			variance_sensitivity: 1};
	jQuery.extend(config, config_object);

	var history_length = config.sampling_length;
	var number_of_subbands = config.number_of_subbands;
	var first_subband_width = config.first_subband_width;
	var sensitivity = config.sensitivity;
	var variance_sensitivity = config.sensitivity;
	var gb = config.onBeat;
	var nb = config.offBeat;

	// Because of this call to webkitAudioContext, this function should only be run once ever.		
	ctx = new webkitAudioContext();

	var source = ctx.createMediaElementSource(audio_element);
	var analyser = ctx.createAnalyser();
	var filter = ctx.createScriptProcessor(1024, 1, 1);
	
	var input_array = new Uint8Array(analyser.frequencyBinCount);

	//From that one beat detection thinger, archive.gamedev.net/archive/reference/programming/features/beatdetection/index.html
	var width_constant = (first_subband_width*(number_of_subbands+1) - (2*analyser.frequencyBinCount/number_of_subbands))/(number_of_subbands-1);
	var width_increase = first_subband_width - width_constant; 

	// Build the stops for the subbands
	stops = new Array(number_of_subbands+1); // Stops contains the frequency subband boundaries. the first subband is between stops[0] and stops[1].
	stops[0] = 0;
	for (var i=0; i<number_of_subbands; i++) { stops[i+1] = Math.floor(stops[i] + width_increase*(i+1) + width_constant); }

	var energy_history = new Array(number_of_subbands);
	var energy_total = new Array(number_of_subbands);
	var circle_index = 0;
	for (var i=0; i<number_of_subbands; i++) {
		energy_history[i] = new Array(history_length);
		jQuery.each(energy_history[i], function(j) { energy_history[i][j] = 0; }); // Make all the history buffers zero.
		energy_total[i] = 0;
	}

	var variance, diff, band, i, beats_this_frame;
	filter.onaudioprocess = function(e) { 
		// Pass the audio to the output unchanged.
		data = e.inputBuffer.getChannelData(0);
		for(var i=0; i<data.length; i++) { input_array[i] = 0; e.outputBuffer.getChannelData(0)[i] = data[i]; }

		analyser.getByteFrequencyData(input_array);

		beats_this_frame = 0;
		for (band=0; band<number_of_subbands; band++) { // Iterate over the frequency windows we're interested in.
			// Subtract the historical energy value from the running total.
			energy_total[band] -= energy_history[band][circle_index];

			// Store the total energy of the subband `band` into the history's data for it
			energy_history[band][circle_index] = 0;
			for (i=stops[band]; i<stops[band+1]; i++) { energy_history[band][circle_index] += (input_array[i]/256); }

			energy_total[band] += energy_history[band][circle_index];

			variance = 0; //variances[f] = 0;
			for (i=0; i<history_length; i++) {
				diff = energy_history[band][i] - energy_total[band];
				variance += diff*diff; //variances[f] += diff*diff;
			}

			// If the condition is satisfied, then increment the number of beats in the frame.
			if (energy_history[band][circle_index] > sensitivity*energy_total[band]/history_length && variance > variance_sensitivity) { beats_this_frame += 1; }
		}
		// Increment the index into the history buffer, which is done like this so that we don't have to reorder the array when we push into it.
		circle_index = (circle_index + 1) % history_length;

		if (beat_test(beats_this_frame, number_of_subbands)) { gb(); }
		else { nb(); }
	}

	source.connect(analyser);
	analyser.connect(filter);
	filter.connect(ctx.destination);
}
