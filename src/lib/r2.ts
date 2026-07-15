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
