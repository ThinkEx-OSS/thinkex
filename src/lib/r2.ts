export async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
	while (true) {
		const page = await bucket.list({ prefix, limit: 1_000 });

		if (page.objects.length === 0) {
			return;
		}

		await bucket.delete(page.objects.map((object) => object.key));

		if (!page.truncated) {
			return;
		}
	}
}

export async function putFixedLengthR2Object(
	bucket: R2Bucket,
	key: string,
	input: {
		body: ReadableStream<Uint8Array>;
		sizeBytes: number;
	},
	options?: R2PutOptions,
) {
	const stream = new FixedLengthStream(input.sizeBytes);
	const [object] = await Promise.all([
		bucket.put(key, stream.readable, options),
		input.body.pipeTo(stream.writable),
	]);

	return object;
}
